import { db, pool } from '../db.js';
import { tokenLogos } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Stablecoin addresses and their official logo URLs
const STABLECOIN_LOGOS = {
  // USDC from Ethereum
  '0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07': {
    symbol: 'USDC',
    name: 'USD Coin from Ethereum',
    logoUrl: 'https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png'
  },
  // USDT from Ethereum  
  '0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f': {
    symbol: 'USDT',
    name: 'Tether USD from Ethereum',
    logoUrl: 'https://assets.coingecko.com/coins/images/325/large/Tether.png'
  },
  // DAI from Ethereum
  '0xefd766ccb38eaf1dfd701853bfce31359239f305': {
    symbol: 'DAI',
    name: 'Dai Stablecoin from Ethereum',
    logoUrl: 'https://assets.coingecko.com/coins/images/9956/large/4943.png'
  }
};

async function updateStablecoinLogos() {
  console.log('Updating stablecoin logos...');
  
  try {
    for (const [address, info] of Object.entries(STABLECOIN_LOGOS)) {
      console.log(`\nUpdating ${info.symbol} (${address})...`);
      
      // Check if logo already exists
      const [existing] = await db
        .select()
        .from(tokenLogos)
        .where(eq(tokenLogos.tokenAddress, address));
      
      if (existing) {
        // Update existing logo
        const [updated] = await db
          .update(tokenLogos)
          .set({
            logoUrl: info.logoUrl,
            symbol: info.symbol,
            name: info.name,
            lastUpdated: new Date().toISOString()
          })
          .where(eq(tokenLogos.tokenAddress, address))
          .returning();
        
        console.log(`✅ Updated ${info.symbol} logo`);
      } else {
        // Insert new logo
        const [inserted] = await db
          .insert(tokenLogos)
          .values({
            tokenAddress: address,
            logoUrl: info.logoUrl,
            symbol: info.symbol,
            name: info.name,
            lastUpdated: new Date().toISOString()
          })
          .returning();
        
        console.log(`✅ Inserted ${info.symbol} logo`);
      }
    }
    
    console.log('\n✨ All stablecoin logos updated successfully!');
    
  } catch (error) {
    console.error('Error updating stablecoin logos:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the update
updateStablecoinLogos()
  .then(() => {
    console.log('\nScript completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });