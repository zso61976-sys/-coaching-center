'use client';

import { useEffect, useState } from 'react';
import { CheckCircle } from 'lucide-react';

interface SuccessScreenProps {
  mode: 'checkin' | 'checkout';
  studentName: string;
  time: string;
  duration?: number;
  onDone: () => void;
}

export default function SuccessScreen({
  mode,
  studentName,
  time,
  duration,
  onDone,
}: SuccessScreenProps) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onDone();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onDone]);

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins} minutes`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex flex-col items-center justify-center p-8">
      {/* Success Icon */}
      <div className="mb-8 animate-bounce">
        <CheckCircle className="w-48 h-48 text-primary-500" strokeWidth={1.5} />
      </div>

      {/* Success Message */}
      <h1 className="text-5xl font-bold text-gray-800 mb-4">
        Success!
      </h1>

      {/* Student Info */}
      <p className="text-3xl text-gray-700 mb-2">
        {mode === 'checkin' ? 'Welcome' : 'Goodbye'}, {studentName}
      </p>

      {/* Time */}
      <p className="text-2xl text-gray-600 mb-4">
        {mode === 'checkin' ? 'Checked in at' : 'Checked out at'} {time}
      </p>

      {/* Duration (for checkout only) */}
      {mode === 'checkout' && duration !== undefined && (
        <p className="text-xl text-gray-500 mb-8">
          Duration: {formatDuration(duration)}
        </p>
      )}

      {/* Auto-return message */}
      <p className="text-lg text-gray-400 mb-8">
        Returning to home in {countdown} seconds...
      </p>

      {/* Done Button */}
      <button
        onClick={onDone}
        className="kiosk-button kiosk-button-primary w-80 h-20 text-2xl"
      >
        Done
      </button>
    </div>
  );
}
