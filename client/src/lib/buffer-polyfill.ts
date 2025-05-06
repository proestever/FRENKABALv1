/**
 * Buffer Polyfill Module
 * 
 * This module provides a safe way to handle Buffer operations in browser environments,
 * where the Node.js Buffer module is not available directly.
 * 
 * The Vite browser build externalizes the 'buffer' module,
 * so we need to handle this safely to prevent runtime errors.
 */

// Type definition to help with TypeScript
interface BufferType {
  from: (data: string, encoding?: string) => Uint8Array;
  isBuffer: (obj: any) => boolean;
  // Add other Buffer methods as needed
}

/**
 * Safe Buffer Implementation for Browser Environments
 * 
 * Uses browser's TextEncoder/TextDecoder and Uint8Array
 * as a fallback for Node.js Buffer functionality
 */
export const safeBuffer: BufferType = {
  // Convert string to Uint8Array (similar to Buffer.from)
  from: (data: string, encoding: string = 'utf8'): Uint8Array => {
    try {
      // If browser environment and encoding is hex
      if (encoding === 'hex') {
        const hexString = data.startsWith('0x') ? data.slice(2) : data;
        const arr = new Uint8Array(hexString.length / 2);
        for (let i = 0; i < hexString.length; i += 2) {
          arr[i / 2] = parseInt(hexString.slice(i, i + 2), 16);
        }
        return arr;
      }
      
      // Default UTF-8 encoding using TextEncoder
      return new TextEncoder().encode(data);
    } catch (error) {
      console.error('Error in safeBuffer.from:', error);
      return new Uint8Array();
    }
  },
  
  // Check if object is a Buffer/Uint8Array
  isBuffer: (obj: any): boolean => {
    return (
      obj instanceof Uint8Array || 
      (obj && typeof obj === 'object' && obj.constructor && obj.constructor.name === 'Uint8Array')
    );
  }
  
  // Additional Buffer methods can be added here as needed
};

/**
 * Safely attempts to import the Node.js Buffer or falls back to our polyfill
 */
export function getBufferImplementation(): BufferType {
  try {
    // Try to access Buffer from global scope (when using browserify/webpack)
    if (typeof window !== 'undefined' && (window as any).Buffer) {
      // Silently use Buffer from window object (no logging)
      return (window as any).Buffer;
    }
    
    // In Node.js environments or with successful dynamic import
    return safeBuffer;
  } catch (error) {
    // Silently use our polyfill
    return safeBuffer;
  }
}

// Export a ready-to-use buffer object
export default getBufferImplementation();