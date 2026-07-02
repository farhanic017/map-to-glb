#!/usr/bin/env python3
"""
Map to GLB - GPU Server for Google Colab
Copyright (C) 2026 Farhan Dhrubo
Licensed under GNU General Public License v3.0
https://github.com/farhanic017/map-to-glb

Run this notebook to create a GPU server for Map to GLB processing.
"""

# Cell 1: Install dependencies
!pip install flask pyngrok requests

# Cell 2: Import libraries
import threading
import json
from flask import Flask, request, jsonify
from pyngrok import ngrok

# Cell 3: Create Flask app
app = Flask(__name__)

@app.route('/api/mapglb/process', methods=['POST'])
def process_buildings():
    """Process map bounds and return building geometry."""
    try:
        data = request.json
        bounds = data.get('bounds', {})
        
        # Validate bounds
        required_keys = ['south', 'west', 'north', 'east']
        if not all(key in bounds for key in required_keys):
            return jsonify({'error': 'Missing required bounds'}), 400
        
        # Process buildings using GPU
        buildings = process_with_gpu(bounds)
        
        return jsonify({'buildings': buildings})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def process_with_gpu(bounds):
    """
    Process map bounds and generate building geometry.
    Replace this with your actual GPU processing logic.
    """
    # TODO: Implement actual GPU processing
    # This is a placeholder that returns empty results
    return []

# Cell 4: Start server and create public URL
def start_server():
    app.run(host='0.0.0.0', port=5000)

# Start server in background
server_thread = threading.Thread(target=start_server, daemon=True)
server_thread.start()

# Create public URL with ngrok
try:
    public_url = ngrok.connect(5000)
    print(f"\n{'='*60}")
    print(f"Map to GLB GPU Server is running!")
    print(f"\nCopy this URL and paste it in Map to GLB:")
    print(f"\n{public_url}")
    print(f"\n{'='*60}")
    print(f"\nMake sure to:")
    print(f"1. Enable GPU runtime (Runtime → Change runtime type → GPU)")
    print(f"2. Keep this notebook running")
    print(f"3. Don't close the Colab tab")
except Exception as e:
    print(f"\nError creating ngrok tunnel: {e}")
    print("Make sure to enable GPU runtime first!")
    print("Runtime → Change runtime type → GPU")
