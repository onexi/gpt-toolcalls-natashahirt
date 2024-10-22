import json
from openai import OpenAI
import os
import requests
from dotenv import load_dotenv  # Import the load_dotenv function
from opencage.geocoder import OpenCageGeocode
from flask import Flask, request, jsonify
from flask_cors import CORS
import logging

# Load environment variables from .env file
load_dotenv()

# Initialize the OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Configure logging
logging.basicConfig(level=logging.DEBUG)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "http://localhost:3000"}})  # Allow requests from your Node.js server

# Define the functions
def get_weather_data(lat, lon):
    """Fetch the complete weather data for a specific location."""
    api_key = os.getenv("OPENWEATHERMAP_API_KEY")  # Store your API key in an environment variable
    base_url = "https://api.openweathermap.org/data/3.0/onecall"
    
    # API request
    params = {
        'lat': lat,
        'lon': lon,
        'exclude': 'minutely,hourly,daily,alerts',
        'appid': api_key,
        'units': 'metric'
    }
    response = requests.get(base_url, params=params)
    
    if response.status_code == 200:
        return response.json()  # Return the entire JSON response
    else:
        # Debugging information
        error_message = f"Failed to retrieve data. Status Code: {response.status_code}, Response: {response.text}"
        return {"error": error_message}

def get_coordinates(location):
    """Get the latitude and longitude for a given location."""
    api_key = os.getenv("OPENCAGE_API_KEY")  # Store your OpenCage API key in an environment variable
    geocoder = OpenCageGeocode(api_key)
    
    # Query the geocoding API
    results = geocoder.geocode(location)
    
    if results and len(results):
        # Extract latitude and longitude
        latitude = results[0]['geometry']['lat']
        longitude = results[0]['geometry']['lng']
        return latitude, longitude
    else:
        print("Location not found.")
        return None, None

# Define function metadata for API
functions = [
    {
        "name": "get_weather_data",
        "description": "Get the complete weather data for a specific location",
        "parameters": {
            "type": "object",
            "properties": {
                "lat": {
                    "type": "number",
                    "description": "The latitude of the location"
                },
                "lon": {
                    "type": "number",
                    "description": "The longitude of the location"
                }
            },
            "required": ["lat", "lon"]
        }
    }
]

@app.route('/weather', methods=['POST'])
def process_user_question():
    try:
        data = request.json
        if not data or 'question' not in data:
            return jsonify({"error": "Invalid request data"}), 400

        question = data['question']
        logging.debug(f"Request Headers: {request.headers}")
        logging.debug(f"Request Body: {request.json}")

        # Use the LLM to interpret the question
        llm_response = client.chat.completions.create(
            model="gpt-4-0613",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a weather assistant. Your task is to determine the location and type of weather data needed based on the user's question. "
                        "Please respond with the following format:\n"
                        "Location: <location_name>\n"
                        "Type of Weather Data: <data_type>"
                    )
                },
                {"role": "user", "content": question}
            ]
        )

        # Extract the location and type of data needed from the LLM's response
        llm_message = llm_response.choices[0].message.content
        print(f"LLM Interpretation: {llm_message}")

        # Parse the LLM's response to extract the location
        location_line = next((line for line in llm_message.split('\n') if "Location:" in line), None)
        if location_line:
            location = location_line.split(":")[-1].strip()
        else:
            return jsonify({"error": "Could not determine location from LLM response."}), 400

        # Parse the LLM's response to extract the type of data needed
        data_type_line = next((line for line in llm_message.split('\n') if "Type of Weather Data:" in line), None)
        if data_type_line:
            weather_data_type = data_type_line.split(":")[-1].strip()
        else:
            print("Could not determine data type from LLM response.")
            return

        # Get coordinates for the location
        lat, lon = get_coordinates(location)

        if lat is not None and lon is not None:
            # Get weather data for the coordinates
            weather_data = get_weather_data(lat, lon)
            
            # Convert the result to a JSON string
            weather_data_json_str = json.dumps(weather_data)

            # Use the LLM to generate a natural language description
            llm_response = client.chat.completions.create(
                model="gpt-4-0613",
                messages=[
                    {"role": "system", "content": "You are a weather assistant. Respond in natural language. You are friendly but professional. Focus on the facts. Do not include any other information than is required to answer the question. At the end of your response, include how a person might want to dress for the day based on the weather."},
                    {"role": "user", "content": f"Based on the following data, answer the user's question about {weather_data_type} in {location} specifically and concisely: {weather_data_json_str}"}
                ]
            )

            # Return the LLM's response
            return jsonify({"response": llm_response.choices[0].message.content})
        else:
            return jsonify({"error": "Could not retrieve weather data for the specified input."}), 400
    except Exception as e:
        logging.error(f"An error occurred: {str(e)}", exc_info=True)
        return jsonify({"error": "Internal Server Error"}), 500

if __name__ == '__main__':
    app.run(debug=True)
