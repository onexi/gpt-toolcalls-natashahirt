#!/bin/bash

# Navigate to the directory containing your Flask app
cd L05/

# Set the FLASK_APP environment variable
export FLASK_APP=app.py

# Start the Flask server on the desired port
flask run --port=5001