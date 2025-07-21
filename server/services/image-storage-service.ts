import fetch from 'node-fetch';

/**
 * Download an image from a URL and convert it to base64
 */
export async function downloadImageAsBase64(imageUrl: string | null): Promise<{ 
  imageData: string; 
  imageType: string;
} | null> {
  try {
    // Skip if URL is null or empty
    if (!imageUrl) {
      return null;
    }
    
    // Skip if it's already a data URL or local asset
    if (imageUrl.startsWith('data:') || imageUrl.startsWith('/assets/')) {
      console.log(`Skipping download for local/data URL: ${imageUrl}`);
      return null;
    }
    
    console.log(`Attempting to download image from: ${imageUrl}`);

    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      console.error(`Failed to download image from ${imageUrl}: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type');
    
    // Only process supported image types
    if (!contentType || !contentType.startsWith('image/')) {
      console.error(`Invalid content type for ${imageUrl}: ${contentType}`);
      return null;
    }

    const buffer = await response.buffer();
    const base64 = buffer.toString('base64');
    
    return {
      imageData: base64,
      imageType: contentType
    };
  } catch (error) {
    console.error(`Error downloading image from ${imageUrl}:`, error);
    return null;
  }
}

/**
 * Convert a base64 image to a data URL
 */
export function base64ToDataUrl(base64: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64}`;
}