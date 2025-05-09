import React, { useRef } from 'react';
import { Card } from '@/components/ui/card';
import { formatCurrency, formatTokenAmount } from '@/lib/utils';
import { TokenLogo } from '@/components/token-logo';
import { Wallet } from '@shared/schema';
import { ProcessedToken } from 'server/types';
import { Share2, Download, Twitter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toPng } from 'html-to-image';
import { saveAs } from 'file-saver';
import plsLogo from '../assets/pls-logo-optimized.png';
import frenkabalLogo from '../assets/frenklabal_logo.png';

interface ShareWalletCardProps {
  wallet: Wallet;
  portfolioName?: string;
  tokens: ProcessedToken[];
}

export function ShareWalletCard({ wallet, portfolioName, tokens }: ShareWalletCardProps) {
  // Reference to the card element we want to capture
  const cardRef = useRef<HTMLDivElement>(null);

  // Sort tokens by value in descending order and take top 5
  const top5Tokens = [...tokens]
    .filter(token => token.value && token.value > 0)
    .sort((a, b) => (b.value || 0) - (a.value || 0))
    .slice(0, 5);

  // Generate share image and save
  const handleDownloadImage = async () => {
    if (!cardRef.current) return;
    
    try {
      const dataUrl = await toPng(cardRef.current, { 
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#121212',
      });
      
      saveAs(dataUrl, `${portfolioName || 'wallet'}-portfolio.png`);
    } catch (error) {
      console.error('Error generating image:', error);
    }
  };

  // Share on Twitter
  const handleTwitterShare = async () => {
    if (!cardRef.current) return;
    
    try {
      const dataUrl = await toPng(cardRef.current, { 
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#121212',
      });
      
      // Create a blob from the data URL
      const blob = await fetch(dataUrl).then(res => res.blob());
      
      // Save the blob as a file
      const file = new File([blob], 'portfolio.png', { type: 'image/png' });
      
      // Create a text for the tweet
      const text = `Check out my ${portfolioName ? portfolioName + ' ' : ''}PulseChain portfolio worth ${formatCurrency(wallet.totalValue || 0)} via @FrenKabal! `;
      
      // Create the Twitter intent URL
      const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent('https://frenkabal.replit.app/')}`;
      
      // Open Twitter in a new window
      window.open(twitterIntentUrl, '_blank');
    } catch (error) {
      console.error('Error sharing to Twitter:', error);
    }
  };
  
  return (
    <div className="mt-4 mb-4">
      {/* The card that will be captured for the share image */}
      <Card 
        ref={cardRef} 
        className="p-6 glass-card border-white/15 bg-gradient-to-br from-black/80 to-black/40 backdrop-blur-xl"
        style={{ width: '600px', maxWidth: '100%' }}
      >
        {/* Header - Logo and Title */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center">
            <img src={frenkabalLogo} alt="FrenKabal Logo" className="h-8 mr-2" />
            <h2 className="text-xl font-bold text-white">
              {portfolioName ? `${portfolioName} Portfolio` : 'Wallet Portfolio'}
            </h2>
          </div>
          <div className="text-sm text-gray-400">
            {new Date().toLocaleDateString()}
          </div>
        </div>
        
        {/* Total Value */}
        <div className="mb-6">
          <div className="text-sm text-gray-400 mb-1">Total Portfolio Value</div>
          <div className="text-3xl font-bold text-white">
            {formatCurrency(wallet.totalValue || 0)}
          </div>
        </div>
        
        {/* Top 5 Holdings */}
        <div>
          <div className="text-sm text-gray-400 mb-3">Top 5 Holdings</div>
          <div className="space-y-3">
            {top5Tokens.map((token, index) => (
              <div key={`share-${token.address}-${index}`} className="flex justify-between items-center">
                <div className="flex items-center">
                  <TokenLogo 
                    address={token.address} 
                    symbol={token.symbol}
                    fallbackLogo={token.logo}
                    size="sm"
                  />
                  <div className="ml-2">
                    <div className="text-white font-medium">
                      {token.symbol}
                    </div>
                    <div className="text-sm text-gray-400">
                      {formatTokenAmount(token.balanceFormatted || 0)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-white font-bold">
                    {formatCurrency(token.value || 0)}
                  </div>
                  <div className={`text-xs ${token.priceChange24h && token.priceChange24h > 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {token.priceChange24h !== undefined ? 
                      `${token.priceChange24h > 0 ? '+' : ''}${token.priceChange24h.toFixed(1)}%` : 
                      ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-white/10 flex justify-between items-center">
          <div className="text-xs text-gray-400">
            Generated by FrenKabal
          </div>
          <div className="flex items-center">
            <img src={plsLogo} alt="PulseChain" className="h-6" />
            <span className="ml-2 text-sm text-white font-medium">PulseChain</span>
          </div>
        </div>
      </Card>
      
      {/* Buttons for downloading and sharing */}
      <div className="flex gap-2 mt-4">
        <Button
          onClick={handleDownloadImage}
          className="flex items-center gap-2 glass-card border-white/15 bg-black/20 hover:bg-white/10 text-white"
        >
          <Download size={16} />
          Download Image
        </Button>
        
        <Button
          onClick={handleTwitterShare}
          className="flex items-center gap-2 glass-card border-white/15 bg-black/20 hover:bg-white/10 text-white"
        >
          <Twitter size={16} />
          Share on Twitter
        </Button>
      </div>
    </div>
  );
}