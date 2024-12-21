from flask import Flask, request, jsonify
import tempfile
import wave
import sounddevice as sd
import whisperx
import torch
from googletrans import Translator
import os

app = Flask(__name__)

# Directory to store the audio files temporarily
AUDIO_STORAGE_DIR = "audio_files"
os.makedirs(AUDIO_STORAGE_DIR, exist_ok=True)

# Function to record audio using the microphone
def record_audio_from_microphone(duration=10, sample_rate=16000):
    audio_data = sd.rec(int(duration * sample_rate), samplerate=sample_rate, channels=1, dtype="int16")
    sd.wait()
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav", dir=AUDIO_STORAGE_DIR) as temp_audio_file:
        with wave.open(temp_audio_file.name, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(audio_data.tobytes())
        return temp_audio_file.name

# Function to transcribe audio using WhisperX
def transcribe_audio_with_whisperx(audio_file_path):
    device = "cuda" if torch.cuda.is_available() else "cpu"
    
    batch_size = 16 
    compute_type = "int8" 
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True
    model = whisperx.load_model("large-v2", device, compute_type=compute_type)

    audio = whisperx.load_audio(audio_file_path)
    result = model.transcribe(audio, batch_size=batch_size, language="en")

    align_model, metadata = whisperx.load_align_model(language_code="en", device=device)
    aligned_result = whisperx.align(result["segments"], align_model, metadata, audio, device)

    return aligned_result["segments"]

# Function to translate text using Google Translate
def translate_text(text, target_lang="kn"):
    if not text:
        return "No text provided"

    translator = Translator()
    try:
        result = translator.translate(text, dest=target_lang)
        return result.text
    except AttributeError:
        return "Translation error"

# Flask route to record audio and return file path
@app.route("/record", methods=["POST"])
def record_audio():
    try:
        # Record audio for 7 seconds
        audio_file_path = record_audio_from_microphone(duration=7)
        return jsonify({"message": "Audio recorded successfully!", "audio_file_path": audio_file_path}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Flask route to transcribe audio and return transcription
@app.route("/transcribe", methods=["POST"])
def transcribe_audio():
    try:
        # Get the audio file path from the frontend (uploaded via base64 or file)
        audio_file = request.files.get("audio")
        if not audio_file:
            return jsonify({"error": "Audio file is required"}), 400
        
        # Save the audio file temporarily
        audio_file_path = os.path.join(AUDIO_STORAGE_DIR, audio_file.filename)
        audio_file.save(audio_file_path)

        # Process the audio and transcribe it
        transcription_segments = transcribe_audio_with_whisperx(audio_file_path)
        full_transcription = " ".join([segment['text'] for segment in transcription_segments])

        # Optionally, delete the temporary audio file
        os.remove(audio_file_path)

        return jsonify({"transcription": full_transcription}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Flask route to translate text
@app.route("/translate", methods=["POST"])
def translate_audio_text():
    try:
        text = request.json.get("text")
        target_lang = request.json.get("target_lang", "kn")

        if not text:
            return jsonify({"error": "Text is required for translation"}), 400

        translated_text = translate_text(text, target_lang)

        return jsonify({"translated_text": translated_text}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Flask route for sending and receiving messages (for text, audio, and images)
@app.route("/message", methods=["POST"])
def handle_message():
    try:
        message_data = request.json
        message_type = message_data.get("type")
        message_content = message_data.get("content")
        is_user = message_data.get("isUser", True)

        if message_type == "text":
            # If the message is text, translate if necessary (translate on frontend)
            translated_message = translate_text(message_content, target_lang="kn")
            return jsonify({
                "response": translated_message,
                "type": "text",
                "isUser": not is_user
            }), 200
        
        elif message_type == "audio":
            # Handle audio message by transcribing it
            # Save the audio file
            audio_file_path = os.path.join(AUDIO_STORAGE_DIR, "user_audio.wav")
            with open(audio_file_path, "wb") as audio_file:
                audio_file.write(message_content.encode("utf-8"))
            
            # Transcribe audio
            transcription_segments = transcribe_audio_with_whisperx(audio_file_path)
            full_transcription = " ".join([segment['text'] for segment in transcription_segments])

            # Clean up temporary audio file
            os.remove(audio_file_path)

            return jsonify({
                "response": full_transcription,
                "type": "text",
                "isUser": False
            }), 200
        
        elif message_type == "image":
            # For image, handle accordingly (add image processing if needed)
            return jsonify({
                "response": "Image received successfully",
                "type": "image",
                "isUser": not is_user
            }), 200
        
        else:
            return jsonify({"error": "Invalid message type"}), 400

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Run the Flask app
if __name__ == "__main__":
    app.run(debug=True)
