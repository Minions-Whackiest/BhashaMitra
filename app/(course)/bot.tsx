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
  Modal,
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

type Language = 'kannada' | 'telugu' | 'tamil' | 'hindi';

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<Language>('kannada');
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  const targetLang = React.useMemo(() => {
    switch (selectedLanguage) {
      case 'kannada':
        return 'kn';
      case 'telugu':
        return 'te';
      case 'tamil':
        return 'ta';
      case 'hindi':
        return 'hi';
      default:
        return 'kn';
    }
  }, [selectedLanguage]);

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

      const response = await axios.post('http://127.0.0.1:5000/message', {
      type: 'text',
      content: inputText,
      isUser: true,
      targetLang: targetLang,
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
  
        // Single request to record and start processing
        const recordResponse = await axios.post('http://127.0.0.1:5000/record', {
          targetLang: targetLang,
        });
        const taskId = recordResponse.data.task_id;

        const newAudioMessage: Message = {
            id: Date.now().toString(),
            type: 'audio',
            content: 'Audio recorded',
            isUser: true,
        };
        setMessages((prev: Message[]) => [...prev, newAudioMessage]);

        const newTextMessage: Message = {
            id: (Date.now() + 1).toString(),
            type: 'text',
            content: 'Transcription in progress...',
            isUser: false,
        };
        setMessages((prev: Message[]) => [...prev, newTextMessage]);
      
        // Status checking remains the same
        const checkStatus = async () => {
            try {
                const statusResponse = await axios.get(`http://127.0.0.1:5000/check_status/${taskId}`);
                if (statusResponse.data.status === 'completed') {
                  const transcription = statusResponse.data.transcription;
                  const translation = statusResponse.data.translation || 'No translation available.';
                  // Update the transcription message
                  setMessages((prev: Message[]) =>
                    prev.map(msg =>
                      msg.id === newTextMessage.id ? { ...msg, content: transcription } : msg
                    )
                  );
                  // Create a separate message entry for translation
                  const newTranslationMessage: Message = {
                    id: (Date.now() + 2).toString(),
                    type: 'text',
                    content: translation,
                    isUser: false,
                  };
                  setMessages((prev: Message[]) => [...prev, newTranslationMessage]);
                  clearInterval(intervalId);
                  } else if (statusResponse.data.status === 'failed') {
                    const transcription = 'Transcription failed.';
                    setMessages((prev: Message[]) =>
                      prev.map(msg =>
                        msg.id === newTextMessage.id ? { ...msg, content: transcription } : msg
                      )
                    );
                    clearInterval(intervalId);
                  }
            } catch (error) {
                console.error('Error checking transcription status:', error);
                clearInterval(intervalId);
            }
        };
      
        const intervalId = setInterval(checkStatus, 3000);
  
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

  const renderLanguageModal = () => (
    <Modal
      visible={showLanguageModal}
      transparent={true}
      animationType="slide"
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Select Language</Text>
          {(['kannada', 'telugu', 'tamil', 'hindi'] as Language[]).map((lang) => (
            <TouchableOpacity
              key={lang}
              style={styles.languageOption}
              onPress={() => {
                setSelectedLanguage(lang);
                setShowLanguageModal(false);
              }}
            >
              <Text style={styles.languageOptionText}>{lang.charAt(0).toUpperCase() + lang.slice(1)}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setShowLanguageModal(false)}
          >
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

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

      <TouchableOpacity
        style={styles.languageButton}
        onPress={() => setShowLanguageModal(true)}
      >
        <Ionicons name="language" size={24} color="#FFFFFF" />
        <Text style={styles.languageButtonText}>
          {selectedLanguage.charAt(0).toUpperCase() + selectedLanguage.slice(1)}
        </Text>
      </TouchableOpacity>

      {renderLanguageModal()}
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
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#363636',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#2B2B2B',
  },
  languageButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginLeft: 8,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#2B2B2B',
    borderRadius: 12,
    padding: 20,
    width: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  languageOption: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#363636',
  },
  languageOptionText: {
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  closeButton: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#363636',
    borderRadius: 8,
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
  },
});

