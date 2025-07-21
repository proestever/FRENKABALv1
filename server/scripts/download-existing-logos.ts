import { db, pool } from '../db.js';
import { tokenLogos } from '@shared/schema';
import { downloadImageAsBase64 } from '../services/image-storage-service.js';
import { eq, isNotNull, isNull } from 'drizzle-orm';

async function downloadExistingLogos() {
  console.log('Starting to download existing logo URLs...');
  
  try {
    // Get all logos that have URLs but no image data
    const logosToDownload = await db
      .select()
      .from(tokenLogos)
      .where(
        isNotNull(tokenLogos.logoUrl)
      )
      .where(
        isNull(tokenLogos.imageData)
      );
    
    console.log(`Found ${logosToDownload.length} logos to download`);
    
    let successCount = 0;
    let failCount = 0;
    
    // Process in batches to avoid overwhelming the server
    const batchSize = 10;
    for (let i = 0; i < logosToDownload.length; i += batchSize) {
      const batch = logosToDownload.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (logo) => {
        try {
          // Skip local assets and data URLs
          if (!logo.logoUrl || 
              logo.logoUrl.startsWith('/assets/') || 
              logo.logoUrl.startsWith('data:')) {
            return;
          }
          
          console.log(`Downloading logo for ${logo.tokenAddress} from ${logo.logoUrl}`);
          
          const imageData = await downloadImageAsBase64(logo.logoUrl);
          
          if (imageData) {
            await db
              .update(tokenLogos)
              .set({
                imageData: imageData.imageData,
                imageType: imageData.imageType,
                lastUpdated: new Date().toISOString()
              })
              .where(eq(tokenLogos.tokenAddress, logo.tokenAddress));
            
            successCount++;
            console.log(`✓ Downloaded logo for ${logo.tokenAddress}`);
          } else {
            failCount++;
            console.log(`✗ Failed to download logo for ${logo.tokenAddress}`);
          }
        } catch (error) {
          failCount++;
          console.error(`Error downloading logo for ${logo.tokenAddress}:`, error);
        }
      }));
      
      // Progress update
      const processed = Math.min(i + batchSize, logosToDownload.length);
      console.log(`Progress: ${processed}/${logosToDownload.length} (${successCount} success, ${failCount} failed)`);
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < logosToDownload.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`\nDownload complete!`);
    console.log(`Successfully downloaded: ${successCount}`);
    console.log(`Failed downloads: ${failCount}`);
    console.log(`Total processed: ${logosToDownload.length}`);
    
  } catch (error) {
    console.error('Error in downloadExistingLogos:', error);
  } finally {
    await pool.end();
  }
}

// Run the migration
downloadExistingLogos();