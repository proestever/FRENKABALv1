import { apiRequest } from '@/lib/queryClient';

// Preset subscription packages with time-based pricing
export const subscriptionPresets = [
  {
    name: '30 Days',
    description: 'Full access to all FrenKabal features',
    durationDays: 30,
    plsCost: '1000000',
    features: ['Real-time wallet tracking', 'Support for all PulseChain tokens', 'Transaction history', 'Portfolio analytics', 'Value tracking'],
    isActive: true,
    displayOrder: 0,
  },
  {
    name: '60 Days',
    description: 'Full access to all FrenKabal features with 10% discount',
    durationDays: 60,
    plsCost: '1800000',
    features: ['Real-time wallet tracking', 'Support for all PulseChain tokens', 'Transaction history', 'Portfolio analytics', 'Value tracking'],
    isActive: true,
    displayOrder: 1,
  },
  {
    name: '90 Days',
    description: 'Full access to all FrenKabal features with 13.3% discount',
    durationDays: 90,
    plsCost: '2600000',
    features: ['Real-time wallet tracking', 'Support for all PulseChain tokens', 'Transaction history', 'Portfolio analytics', 'Value tracking'],
    isActive: true,
    displayOrder: 2,
  },
  {
    name: '365 Days',
    description: 'Full access to all FrenKabal features with 33.3% discount',
    durationDays: 365,
    plsCost: '8000000',
    features: ['Real-time wallet tracking', 'Support for all PulseChain tokens', 'Transaction history', 'Portfolio analytics', 'Value tracking'],
    isActive: true,
    displayOrder: 3,
  }
];

// Helper function to create all preset packages
export const createAllPresetPackages = async (onSuccess?: () => void, onError?: (error: any) => void) => {
  try {
    for (const preset of subscriptionPresets) {
      await apiRequest('POST', '/api/subscription-packages', preset);
    }
    
    if (onSuccess) onSuccess();
    return true;
  } catch (error) {
    console.error("Error creating preset packages:", error);
    if (onError) onError(error);
    return false;
  }
};

// Get default values for the form based on a preset duration
export const getPresetDefaultValues = (durationDays: number = 30) => {
  const preset = subscriptionPresets.find(p => p.durationDays === durationDays) || subscriptionPresets[0];
  return {
    ...preset,
    features: preset.features.join('\n')
  };
};