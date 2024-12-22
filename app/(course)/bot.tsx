import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

interface Message {
  id: string;
  type: 'text' | 'audio' | 'image';
  content: string;
  isUser: boolean;
}

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  React.useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web') {
        const { status: imageStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (imageStatus !== 'granted') {
          alert('Sorry, we need camera roll permissions to make this work!');
        }
      }
    })();
  }, []);

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      type: 'text',
      content: inputText,
      isUser: true,
    };

    setMessages((prev: Message[]) => [...prev, newMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      const response = await axios.post('http://127.0.0.1:5000/message', { type: 'text', // Specifies the type of message
        content: inputText, // Contains the text content of the message
        isUser: true, // Indicates this is a user message
         });
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        type: 'text',
        content: response.data.response || 'No response from AI.',
        isUser: false,
      };
      setMessages((prev: Message[]) => [...prev, aiResponse]);
    } catch (error) {
      console.error(error);
      setMessages((prev: Message[]) => [
        ...prev,
        { id: Date.now().toString(), type: 'text', content: 'Error processing the request', isUser: false },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      setIsRecording(true);
      setIsLoading(true);
  
      // Step 1: Make a POST request to the `/record` endpoint
      const recordResponse = await axios.post('http://127.0.0.1:5000/record');
  
      const audioUrl = recordResponse.data.audio_url;
      const newAudioMessage: Message = {
        id: Date.now().toString(),
        type: 'audio',
        content: audioUrl || 'No audio recorded.',
        isUser: true,
      };
      setMessages((prev: Message[]) => [...prev, newAudioMessage]);
  
      // Step 2: Send the audio file to `/transcribe`
      const formData = new FormData();
      const response = await fetch(audioUrl);
      const blob = await response.blob();
      formData.append('audio', blob, 'audio.mp3');
  
      const transcribeResponse = await axios.post('http://127.0.0.1:5000/transcribe', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
  
      const transcription = transcribeResponse.data.full_transcription || 'No transcription available.';
      const newTextMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'text',
        content: transcription,
        isUser: false,
      };
      setMessages((prev: Message[]) => [...prev, newTextMessage]);
  
      // Step 3: Send the transcribed text to `/translate`
      const translateResponse = await axios.post('http://127.0.0.1:5000/translate', { type: 'text', // Specifies the type of message
        content: inputText, // Contains the text content of the message
        isUser: true, // Indicates this is a user message
         });
  
      const translatedText = translateResponse.data.response || 'No translation available.';
      const newTranslatedMessage: Message = {
        id: (Date.now() + 2).toString(),
        type: 'text',
        content: translatedText,
        isUser: false,
      };
      setMessages((prev: Message[]) => [...prev, newTranslatedMessage]);
    } catch (error) {
      console.error('Error processing audio:', error);
      setMessages((prev: Message[]) => [
        ...prev,
        { id: Date.now().toString(), type: 'text', content: 'Error processing audio', isUser: false },
      ]);
    } finally {
      setIsRecording(false);
      setIsLoading(false);
    }
  };
  

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      const newMessage: Message = {
        id: Date.now().toString(),
        type: 'image',
        content: result.assets[0].uri,
        isUser: true,
      };
      setMessages(prev => [...prev, newMessage]);
    }
  };

  const renderMessage = (message: Message) => {
    const isUser = message.isUser;
    return (
      <View
        key={message.id}
        style={[
          styles.messageContainer,
          isUser ? styles.userMessage : styles.botMessage,
        ]}
      >
        {message.type === 'text' && (
          <Text style={styles.messageText}>{message.content}</Text>
        )}
        {message.type === 'image' && (
          <Image source={{ uri: message.content }} style={styles.messageImage} />
        )}
        {message.type === 'audio' && (
          <TouchableOpacity style={styles.audioButton}>
            <Ionicons name="play" size={24} color="#FFFFFF" />
            <Text style={styles.audioText}>Play Audio</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.messagesContainer}>
        {messages.map(renderMessage)}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#FFFFFF" />
          </View>
        )}
      </ScrollView>

      <View style={styles.inputContainer}>
        <TouchableOpacity onPress={pickImage} style={styles.iconButton}>
          <Ionicons name="image" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={startRecording}
          style={[styles.iconButton, isRecording && styles.recordingButton]}
        >
          <Ionicons name={isRecording ? 'stop' : 'mic'} size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
          placeholderTextColor="#666666"
        />

        <TouchableOpacity onPress={handleSendMessage} style={styles.sendButton}>
          <Ionicons name="send" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  messagesContainer: {
    flex: 1,
    padding: 16,
  },
  messageContainer: {
    maxWidth: '80%',
    marginVertical: 8,
    padding: 12,
    borderRadius: 16,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#2B2B2B',
  },
  botMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#363636',
  },
  messageText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  messageImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
  },
  audioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  audioText: {
    color: '#FFFFFF',
    marginLeft: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#2B2B2B',
  },
  input: {
    flex: 1,
    height: 40,
    backgroundColor: '#363636',
    borderRadius: 20,
    paddingHorizontal: 16,
    marginHorizontal: 8,
    color: '#FFFFFF',
  },
  iconButton: {
    padding: 8,
  },
  sendButton: {
    padding: 8,
  },
  recordingButton: {
    backgroundColor: '#FF4444',
    borderRadius: 20,
  },
  loadingContainer: {
    padding: 16,
    alignItems: 'center',
  },
});
