from flask import Flask, request, jsonify
import tempfile
import wave
import sounddevice as sd
import whisperx
import torch
from googletrans import Translator
import os
from flask_cors import CORS
import threading
import uuid
import logging
from werkzeug.serving import WSGIRequestHandler
import time
import base64

# Configure logging for better debugging and monitoring
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app and enable CORS
app = Flask(__name__)
CORS(app)
global targetLang
# Increase Flask's timeout to 5 minutes for long-running operations
WSGIRequestHandler.timeout = 300

# Set up storage for audio files
AUDIO_STORAGE_DIR = "audio_files"
os.makedirs(AUDIO_STORAGE_DIR, exist_ok=True)
# Dictionary to track all transcription tasks
transcription_tasks = {}

class TranscriptionTask:
    """
    Tracks the status and results of transcription tasks
    Provides a clean interface for managing task state
    """
    def __init__(self):
        self.status = "processing"  # Status can be: processing, completed, or failed
        self.transcription = None   # Holds the English transcription
        self.translation = None     # Holds the translated text
        self.error = None          # Stores any error messages
        self.completion_time = None # Timestamp when task completes

def record_audio_from_microphone(duration=10, sample_rate=16000):
    """
    Records audio from the microphone and saves it as a WAV file
    
    Args:
        duration (int): Recording duration in seconds
        sample_rate (int): Audio sample rate
    
    Returns:
        str: Path to the saved audio file
    """
    # Record audio data
    audio_data = sd.rec(int(duration * sample_rate), samplerate=sample_rate, channels=1, dtype="int16")
    sd.wait()  # Wait for recording to complete
    
    # Save the recorded audio to a temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav", dir=AUDIO_STORAGE_DIR) as temp_audio_file:
        with wave.open(temp_audio_file.name, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(audio_data.tobytes())
        return temp_audio_file.name

def transcribe_and_translate_audio(audio_file_path, task_id=None):
    """
    Handles the complete pipeline of transcription and translation
    
    Args:
        audio_file_path (str): Path to the audio file
        task_id (str): Unique identifier for tracking the task
    """
    try:
        # Configure WhisperX settings
        device = "cpu"
        batch_size = 16 
        compute_type = "int8"
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        
        # Load and run WhisperX model
        logger.info("Loading WhisperX model...")
        model = whisperx.load_model("large-v2", device, compute_type=compute_type)
        logger.info("Model loaded successfully")

        # Transcribe audio
        audio = whisperx.load_audio(audio_file_path)
        result = model.transcribe(audio, batch_size=batch_size, language="en")
        logger.info("Transcription completed")

        # Align transcription with audio
        align_model, metadata = whisperx.load_align_model(language_code="en", device=device)
        aligned_result = whisperx.align(result["segments"], align_model, metadata, audio, device)
        logger.info("Alignment completed")

        # Combine all segments into full text
        transcription_text = " ".join([segment['text'] for segment in aligned_result["segments"]])

        # Translate the transcribed text
        translated_text = translate_text(transcription_text, target_lang=targetLang)

        # Update task status if task_id is provided
        if task_id:
            transcription_tasks[task_id].transcription = transcription_text
            transcription_tasks[task_id].translation = translated_text
            transcription_tasks[task_id].status = "completed"
            transcription_tasks[task_id].completion_time = time.time()
        else:
            return transcription_text, translated_text

    except Exception as e:
        logger.error(f"Error: {str(e)}")
        if task_id:
            transcription_tasks[task_id].status = "failed"
            transcription_tasks[task_id].error = str(e)
        else:
            raise
    finally:
        # Clean up the audio file
        if os.path.exists(audio_file_path):
            os.remove(audio_file_path)
            logger.info(f"Cleaned up audio file: {audio_file_path}")

def translate_text(text, target_lang="kn"):
    """
    Translates text using Google Translate
    
    Args:
        text (str): Text to translate
        target_lang (str): Target language code
    
    Returns:
        str: Translated text
    """
    if not text:
        return "No text provided"

    try:
        translator = Translator()
        result = translator.translate(text, dest=target_lang)
        return result.text
    except Exception as e:
        return f"Translation error: {str(e)}"

def cleanup_old_tasks():
    """
    Removes completed tasks older than 1 hour to prevent memory leaks
    """
    current_time = time.time()
    tasks_to_remove = []
    
    for task_id, task in transcription_tasks.items():
        if (task.status in ["completed", "failed"] and 
            task.completion_time and 
            current_time - task.completion_time > 3600):
            tasks_to_remove.append(task_id)
    
    for task_id in tasks_to_remove:
        del transcription_tasks[task_id]

@app.route("/record", methods=["POST"])
def record_audio():
    """
    Combined endpoint for recording and processing audio
    Handles the complete pipeline in one request
    """
    global targetLang
    targetLang = request.json.get("targetLang")
    try:
        # Record audio
        audio_file_path = record_audio_from_microphone(duration=7)
        
        # Create new task
        task_id = str(uuid.uuid4())
        transcription_tasks[task_id] = TranscriptionTask()

        # Start processing in background thread
        thread = threading.Thread(
            target=transcribe_and_translate_audio,
            args=(audio_file_path, task_id)
        )
        thread.start()

        return jsonify({
            "status": "processing",
            "task_id": task_id,
            "message": "Audio recorded and processing started"
        }), 202
        
    except Exception as e:
        logger.error(f"Recording error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/check_status/<task_id>", methods=["GET"])
def check_status(task_id):
    """
    Endpoint for checking the status of a transcription task
    """
    try:
        task = transcription_tasks.get(task_id)
        if not task:
            return jsonify({
                "status": "not_found",
                "error": "Task not found. It may have been cleaned up due to age."
            }), 404

        if task.status == "completed":
            return jsonify({
                "status": "completed",
                "transcription": task.transcription,
                "translation": task.translation
            }), 200
        elif task.status == "failed":
            return jsonify({
                "status": "failed",
                "error": task.error
            }), 500
        else:
            return jsonify({
                "status": "processing",
                "message": "Transcription and translation are still in progress"
            }), 202

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/translate", methods=["POST"])
def translate_audio_text():
    """
    Endpoint for translating text directly
    """
    try:
        text = request.json.get("text")
        target_lang = request.json.get("target_lang", "kn")

        if not text:
            return jsonify({"error": "Text is required for translation"}), 400

        translated_text = translate_text(text, target_lang)
        return jsonify({"translated_text": translated_text}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
@app.route("/message", methods=["POST"])
def handle_message():
    """
    Endpoint for handling different types of messages (text, audio, image)
    """
    message_data = request.json
    message_type = message_data.get("type")
    message_content = message_data.get("content")
    is_user = message_data.get("isUser", True)
    target_lang = message_data.get("targetLang", "kn")

    if message_type == "text":
        translated_message = translate_text(message_content, target_lang=target_lang)
        return jsonify({
            "response": translated_message,
            "type": "text",
            "isUser": not is_user
        }), 200

if __name__ == "__main__":
    app.run(debug=True, threaded=True)