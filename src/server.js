const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const dotenv = require('dotenv');
const { processUserQuestion } = require('./weatherService');  // Import the OpenAI logic

dotenv.config();

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(process.cwd(), 'public')));

app.post('/ask', async (req, res) => {
    const { question } = req.body;

    if (!question) {
        return res.status(400).json({ error: "Question is required" });
    }

    try {
        const { error, message } = await processUserQuestion(question);
        if (error) {
            // Send the error message as a JSON response
            return res.status(400).json({ error: message });
        }
        // Send the successful response message as a JSON response
        res.json({ response: message });
    } catch (error) {
        console.error('Error processing request:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
