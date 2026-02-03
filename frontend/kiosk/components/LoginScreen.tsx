'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, Delete } from 'lucide-react';

interface LoginScreenProps {
  mode: 'checkin' | 'checkout';
  onSubmit: (studentCode: string, pin: string) => void;
  onBack: () => void;
  loading: boolean;
}

type ActiveField = 'studentCode' | 'pin';

export default function LoginScreen({ mode, onSubmit, onBack, loading }: LoginScreenProps) {
  const [studentCode, setStudentCode] = useState('');
  const [pin, setPin] = useState('');
  const [activeField, setActiveField] = useState<ActiveField>('studentCode');
  const [inactivityTimer, setInactivityTimer] = useState<NodeJS.Timeout | null>(null);

  const resetInactivityTimer = () => {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }
    const timer = setTimeout(() => {
      onBack();
    }, 30000); // 30 seconds
    setInactivityTimer(timer);
  };

  useEffect(() => {
    resetInactivityTimer();
    return () => {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
      }
    };
  }, []);

  const handleNumberPress = (num: string) => {
    resetInactivityTimer();

    if (activeField === 'studentCode') {
      if (studentCode.length < 10) {
        setStudentCode(prev => prev + num);
      }
    } else {
      if (pin.length < 6) {
        setPin(prev => prev + num);
      }
    }
  };

  const handleClear = () => {
    resetInactivityTimer();

    if (activeField === 'studentCode') {
      setStudentCode('');
    } else {
      setPin('');
    }
  };

  const handleBackspace = () => {
    resetInactivityTimer();

    if (activeField === 'studentCode') {
      setStudentCode(prev => prev.slice(0, -1));
    } else {
      setPin(prev => prev.slice(0, -1));
    }
  };

  const handleSubmit = () => {
    if (studentCode && pin.length >= 4) {
      onSubmit(studentCode, pin);
    }
  };

  const isValid = studentCode.length > 0 && pin.length >= 4;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-6 flex flex-col">
      {/* Header */}
      <div className="flex items-center mb-8">
        <button
          onClick={onBack}
          className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300 active:scale-95 transition-all"
        >
          <ArrowLeft className="w-8 h-8 text-gray-600" />
        </button>
        <h1 className="flex-1 text-center text-4xl font-bold text-gray-800 mr-16">
          {mode === 'checkin' ? 'Check In' : 'Check Out'}
        </h1>
      </div>

      {/* Input Fields */}
      <div className="flex-1 flex flex-col items-center justify-center max-w-lg mx-auto w-full">
        {/* Student ID Field */}
        <div className="w-full mb-6">
          <label className="block text-xl font-semibold text-gray-700 mb-3">
            Student ID
          </label>
          <button
            onClick={() => setActiveField('studentCode')}
            className={`input-display ${
              activeField === 'studentCode' ? 'border-primary-500 ring-2 ring-primary-200' : ''
            }`}
          >
            {studentCode || <span className="text-gray-400">Enter ID</span>}
          </button>
        </div>

        {/* PIN Field */}
        <div className="w-full mb-8">
          <label className="block text-xl font-semibold text-gray-700 mb-3">
            PIN
          </label>
          <button
            onClick={() => setActiveField('pin')}
            className={`input-display ${
              activeField === 'pin' ? 'border-primary-500 ring-2 ring-primary-200' : ''
            }`}
          >
            {pin ? '●'.repeat(pin.length) : <span className="text-gray-400">Enter PIN</span>}
          </button>
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handleNumberPress(num.toString())}
              className="numpad-button"
              disabled={loading}
            >
              {num}
            </button>
          ))}
          <button
            onClick={handleClear}
            className="numpad-button text-red-500 text-xl"
            disabled={loading}
          >
            Clear
          </button>
          <button
            onClick={() => handleNumberPress('0')}
            className="numpad-button"
            disabled={loading}
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            className="numpad-button"
            disabled={loading}
          >
            <Delete className="w-8 h-8" />
          </button>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={!isValid || loading}
          className={`w-full h-20 rounded-2xl text-2xl font-bold text-white transition-all duration-200 flex items-center justify-center gap-3 ${
            isValid && !loading
              ? mode === 'checkin'
                ? 'bg-primary-500 hover:bg-primary-600 active:scale-95'
                : 'bg-secondary-500 hover:bg-secondary-600 active:scale-95'
              : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          {loading ? (
            <>
              <Loader2 className="w-8 h-8 animate-spin" />
              Processing...
            </>
          ) : (
            'Confirm'
          )}
        </button>
      </div>
    </div>
  );
}
