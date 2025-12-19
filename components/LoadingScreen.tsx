/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import Spinner from './Spinner';
import { SparkleIcon } from './icons';

interface LoadingScreenProps {
  isLoaded: boolean;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ isLoaded }) => {
  return (
    <div 
      className={`fixed inset-0 bg-gray-900/80 backdrop-blur-xl z-[100] flex flex-col items-center justify-center transition-opacity duration-500 ease-in-out ${isLoaded ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="flex items-center gap-4 mb-6 animate-fade-in" style={{ animationDelay: '200ms' }}>
          <SparkleIcon className="w-12 h-12 text-[var(--color-primary-400)]" />
          <h1 className="text-4xl font-bold tracking-tight text-gray-100">
              PixAI
          </h1>
      </div>
      <div className="animate-fade-in" style={{ animationDelay: '400ms' }}>
        <Spinner />
      </div>
      <p className="mt-6 text-gray-300 animate-fade-in" style={{ animationDelay: '600ms' }}>Initializing editor...</p>
    </div>
  );
};

export default LoadingScreen;