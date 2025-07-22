import { db } from '../db';
import { tokenLogos } from '../../shared/schema';
import { eq } from 'drizzle-orm';

// Stablecoin addresses on PulseChain (bridged from Ethereum)
const STABLECOIN_LOGOS = [
  {
    address: '0x15d38573d2feeb82e7ad5187ab8c5d52810b6f40', // USDC from Ethereum
    logoUrl: 'https://tokens.coingecko.com/images/6319/large/usdc.png',
    symbol: 'USDC',
    name: 'USD Coin'
  },
  {
    address: '0xefD766cCb38EaF1dfd701853BFCe31359239F305', // DAI from Ethereum  
    logoUrl: 'https://tokens.coingecko.com/images/9956/large/Badge_Dai.png',
    symbol: 'DAI',
    name: 'Dai Stablecoin'
  },
  {
    address: '0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f', // USDT from Ethereum
    logoUrl: 'https://tokens.coingecko.com/images/325/large/Tether.png',
    symbol: 'USDT', 
    name: 'Tether USD'
  }
];

async function updateStablecoinLogos() {
  console.log('Updating stablecoin logos...');
  
  for (const stablecoin of STABLECOIN_LOGOS) {
    try {
      // Update existing logo or insert new one
      const existing = await db
        .select()
        .from(tokenLogos)
        .where(eq(tokenLogos.tokenAddress, stablecoin.address.toLowerCase()))
        .limit(1);
      
      if (existing.length > 0) {
        // Update existing logo
        await db
          .update(tokenLogos)
          .set({
            logoUrl: stablecoin.logoUrl,
            symbol: stablecoin.symbol,
            name: stablecoin.name,
            lastUpdated: new Date().toISOString()
          })
          .where(eq(tokenLogos.tokenAddress, stablecoin.address.toLowerCase()));
        
        console.log(`Updated ${stablecoin.symbol} logo`);
      } else {
        // Insert new logo
        await db.insert(tokenLogos).values({
          tokenAddress: stablecoin.address.toLowerCase(),
          logoUrl: stablecoin.logoUrl,
          symbol: stablecoin.symbol,
          name: stablecoin.name,
          lastUpdated: new Date().toISOString()
        });
        
        console.log(`Inserted ${stablecoin.symbol} logo`);
      }
    } catch (error) {
      console.error(`Error updating ${stablecoin.symbol} logo:`, error);
    }
  }
  
  console.log('Stablecoin logos updated successfully!');
  process.exit(0);
}

updateStablecoinLogos().catch(console.error);