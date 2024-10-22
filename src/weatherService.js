const axios = require('axios');
const { Configuration, OpenAIApi } = require('openai');
require('dotenv').config();
const { OpenAI } = require('openai');

// Initialize OpenAI client directly with API key
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
  
// Function to get weather data
async function getWeatherData(lat, lon) {
    const apiKey = process.env.OPENWEATHERMAP_API_KEY;
    const baseUrl = "https://api.openweathermap.org/data/3.0/onecall";
    
    try {
        const response = await axios.get(baseUrl, {
            params: {
                lat: lat,
                lon: lon,
                exclude: 'minutely,hourly,daily,alerts',
                appid: apiKey,
                units: 'metric'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching weather data:', error.message);
        return { error: "Failed to fetch weather data." };
    }
}

// Function to get coordinates from a location name
async function getCoordinates(location) {
    const apiKey = process.env.OPENCAGE_API_KEY;
    const baseUrl = "https://api.opencagedata.com/geocode/v1/json";
    
    try {
        const response = await axios.get(baseUrl, {
            params: {
                q: location,
                key: apiKey
            }
        });

        if (response.data.results.length > 0) {
            const { lat, lng } = response.data.results[0].geometry;
            return { lat, lon: lng };
        } else {
            return { error: "Location not found." };
        }
    } catch (error) {
        console.error('Error fetching coordinates:', error.message);
        return { error: "Failed to fetch coordinates." };
    }
}

// Function to interact with OpenAI and interpret user's question
async function processUserQuestion(question) {
    try {
        // Use OpenAI to interpret the question and determine location & weather data type
        const llmResponse = await openai.chat.completions.create({
            model: "gpt-4-0613",
            messages: [
                {
                    role: "system",
                    content: "You are a weather assistant. Your task is to determine the location and type of weather data needed based on the user's question. " +
                             "Please respond with the following format:\n" +
                             "Location: <location_name>\n" +
                             "Type of Weather Data: <data_type>" + 
                             "If the location is unspecified, <location_name> is 'None'." + 
                             "If the type of weather data is unspecified, <data_type> is 'All data'."
                },
                { role: "user", content: question }
            ]
        });

        // Log the full response for debugging
        console.log('OpenAI API Response:', JSON.stringify(llmResponse, null, 2));

        // Check if the response contains choices
        if (!llmResponse || !llmResponse.choices || llmResponse.choices.length === 0) {
            throw new Error("Invalid response from OpenAI API.");
        }

        // Extract the location and type of data needed from the LLM's response
        const llmMessage = llmResponse.choices[0].message.content;
        console.log(`LLM Interpretation: ${llmMessage}`);

        // Parse the LLM's response to extract the location
        const locationLine = llmMessage.split('\n').find(line => line.includes("Location:"));
        if (!locationLine || locationLine.trim() === "" || locationLine.includes("None")) {
            return { error: false, message: "Please enter a location so that I can answer your question!" };
        }
        
        const location = locationLine.split(":")[1].trim();
        
        // Parse the LLM's response to extract the type of data needed
        const dataTypeLine = llmMessage.split('\n').find(line => line.includes("Type of Weather Data:"));
        if (!dataTypeLine) throw new Error("Could not determine data type from LLM response.");
        
        const weatherDataType = dataTypeLine.split(":")[1].trim();

        // Get coordinates for the location
        const { lat, lon, error: coordError } = await getCoordinates(location);
        if (coordError) throw new Error(coordError);

        // Get weather data for the coordinates
        const weatherData = await getWeatherData(lat, lon);
        if (weatherData.error) throw new Error(weatherData.error);

        // Summarize the weather data with OpenAI
        const weatherDataStr = JSON.stringify(weatherData);
        const summaryResponse = await openai.chat.completions.create({
            model: "gpt-4-0613",
            messages: [
                {
                    role: "system",
                    content: "You are a weather assistant. Respond in natural language. You are friendly but professional." +
                             "Focus on the facts. DO NOT ADD ADDITIONAL INFORMATION BEYOND WHAT IS REQUESTED. " +
                             "If there is no available precipitation data, tell the user that it is not precipitating" +
                             "End with a closing remark (e.g. what the person whould wear)."
                },
                {
                    role: "user",
                    content: `Based on the following data, answer the user's question about ${weatherDataType} in ${location} specifically and concisely: ${weatherDataStr}`
                }
            ]
        });

        // Log the full summary response for debugging
        console.log('OpenAI Summary Response:', JSON.stringify(summaryResponse, null, 2));

        // Check if the summary response contains choices
        if (!summaryResponse || !summaryResponse.choices || summaryResponse.choices.length === 0) {
            throw new Error("Invalid response from OpenAI API during summary.");
        }

        return { error: false, message: summaryResponse.choices[0].message.content };

    } catch (error) {
        console.error('Error processing user question:', error.message);
        return { error: true, message: "Failed to process user question." };
    }
}

module.exports = {
    getWeatherData,
    getCoordinates,
    processUserQuestion
};
