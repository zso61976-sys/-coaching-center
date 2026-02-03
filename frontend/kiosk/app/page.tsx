'use client';

import { useState } from 'react';

const API_URL = 'http://localhost:3000/api';
const KIOSK_SECRET = 'kiosk-secret-key-change-in-production';

type Mode = 'select' | 'checkin' | 'checkout';
type Screen = 'mode' | 'input' | 'success' | 'error';

export default function CheckinPage() {
  const [mode, setMode] = useState<Mode>('select');
  const [screen, setScreen] = useState<Screen>('mode');
  const [studentId, setStudentId] = useState('');
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [studentName, setStudentName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleModeSelect = (selectedMode: Mode) => {
    setMode(selectedMode);
    setScreen('input');
    setStudentId('');
    setPin('');
  };

  const handlePinInput = (digit: string) => {
    if (pin.length < 4) {
      setPin(pin + digit);
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
  };

  const handleSubmit = async () => {
    if (!studentId || pin.length !== 4) return;

    setLoading(true);
    const endpoint = mode === 'checkin' ? 'checkin' : 'checkout';

    try {
      const res = await fetch(`${API_URL}/kiosk/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-kiosk-secret': KIOSK_SECRET,
        },
        body: JSON.stringify({
          student_code: studentId,
          pin,
          branch_id: '660e8400-e29b-41d4-a716-446655440002'
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Operation failed');
      }

      const result = data.data || data;
      setStudentName(result.student_name || result.studentName || studentId);
      setMessage(mode === 'checkin'
        ? `Welcome! You are checked in at ${new Date().toLocaleTimeString()}`
        : `Goodbye! You are checked out at ${new Date().toLocaleTimeString()}`
      );
      setScreen('success');
    } catch (err: any) {
      setMessage(err.message || 'An error occurred');
      setScreen('error');
    } finally {
      setLoading(false);
    }
  };

  const resetToStart = () => {
    setMode('select');
    setScreen('mode');
    setStudentId('');
    setPin('');
    setMessage('');
    setStudentName('');
  };

  // Mode Selection Screen
  if (screen === 'mode') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-500 to-blue-700 flex flex-col items-center justify-center p-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">Student Attendance</h1>
          <p className="text-blue-100">Please select an option</p>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          <button
            onClick={() => handleModeSelect('checkin')}
            className="w-64 h-40 bg-green-500 hover:bg-green-600 text-white rounded-2xl text-3xl font-bold shadow-lg transition-transform hover:scale-105"
          >
            CHECK IN
          </button>
          <button
            onClick={() => handleModeSelect('checkout')}
            className="w-64 h-40 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl text-3xl font-bold shadow-lg transition-transform hover:scale-105"
          >
            CHECK OUT
          </button>
        </div>

        <div className="mt-12 text-white/50 text-sm">
          Coaching Center Attendance System
        </div>
      </div>
    );
  }

  // Input Screen
  if (screen === 'input') {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-8">
        <div className={`w-full max-w-md p-8 rounded-2xl shadow-xl ${mode === 'checkin' ? 'bg-green-50' : 'bg-orange-50'}`}>
          <h2 className={`text-2xl font-bold text-center mb-6 ${mode === 'checkin' ? 'text-green-700' : 'text-orange-700'}`}>
            {mode === 'checkin' ? 'CHECK IN' : 'CHECK OUT'}
          </h2>

          {/* Student ID Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Student ID</label>
            <input
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 text-xl text-center border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter Student ID"
            />
          </div>

          {/* PIN Display */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">PIN</label>
            <div className="flex justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-14 h-14 border-2 border-gray-300 rounded-lg flex items-center justify-center text-2xl font-bold"
                >
                  {pin[i] ? '●' : ''}
                </div>
              ))}
            </div>
          </div>

          {/* Numeric Keypad */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key, i) => (
              <button
                key={i}
                onClick={() => {
                  if (key === '⌫') handleBackspace();
                  else if (key) handlePinInput(key);
                }}
                disabled={key === ''}
                className={`h-16 text-2xl font-bold rounded-lg transition-colors ${
                  key === ''
                    ? 'bg-transparent'
                    : key === '⌫'
                    ? 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                    : 'bg-white hover:bg-gray-100 border border-gray-300 text-gray-800'
                }`}
              >
                {key}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={resetToStart}
              className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!studentId || pin.length !== 4 || loading}
              className={`flex-1 py-3 text-white rounded-lg font-medium disabled:opacity-50 ${
                mode === 'checkin'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-orange-600 hover:bg-orange-700'
              }`}
            >
              {loading ? 'Processing...' : 'Submit'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Success Screen
  if (screen === 'success') {
    return (
      <div className="min-h-screen bg-green-500 flex flex-col items-center justify-center p-8">
        <div className="text-center text-white">
          <div className="text-8xl mb-6">✓</div>
          <h1 className="text-4xl font-bold mb-4">Success!</h1>
          <p className="text-2xl mb-2">{studentName}</p>
          <p className="text-xl opacity-90">{message}</p>
        </div>
        <button
          onClick={resetToStart}
          className="mt-12 px-8 py-4 bg-white text-green-600 rounded-xl text-xl font-bold hover:bg-green-50"
        >
          Done
        </button>
      </div>
    );
  }

  // Error Screen
  if (screen === 'error') {
    return (
      <div className="min-h-screen bg-red-500 flex flex-col items-center justify-center p-8">
        <div className="text-center text-white">
          <div className="text-8xl mb-6">✕</div>
          <h1 className="text-4xl font-bold mb-4">Error</h1>
          <p className="text-xl opacity-90">{message}</p>
        </div>
        <button
          onClick={resetToStart}
          className="mt-12 px-8 py-4 bg-white text-red-600 rounded-xl text-xl font-bold hover:bg-red-50"
        >
          Try Again
        </button>
      </div>
    );
  }

  return null;
}
