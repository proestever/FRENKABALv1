import { Router, Request, Response } from 'express';
import fetch from 'node-fetch';
import { z } from 'zod';

const router = Router();

// ChangeNow API base URL
const CHANGE_NOW_API_BASE = 'https://api.changenow.io/v1';

// Schema for minimum exchange amount request
const MinAmountRequestSchema = z.object({
  fromCurrency: z.string(),
  toCurrency: z.string(),
});

// Schema for exchange range request
const ExchangeRangeRequestSchema = z.object({
  fromCurrency: z.string(),
  toCurrency: z.string(),
  fromAmount: z.string().optional(),
});

// Schema for create exchange request
const CreateExchangeRequestSchema = z.object({
  fromCurrency: z.string(),
  toCurrency: z.string(),
  fromAmount: z.string(),
  toAmount: z.string(),
  address: z.string(),
  extraId: z.string().optional(),
  refundAddress: z.string().optional(),
  refundExtraId: z.string().optional(),
  userId: z.string().optional(),
  payload: z.string().optional(),
  contactEmail: z.string().optional(),
});

// Get list of available currencies
router.get('/available-currencies', async (_req: Request, res: Response) => {
  try {
    const response = await fetch(`${CHANGE_NOW_API_BASE}/currencies?active=true`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error fetching available currencies:', errorText);
      return res.status(response.status).json({ 
        error: 'Failed to fetch available currencies',
        details: errorText
      });
    }
    
    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Error fetching available currencies:', error);
    return res.status(500).json({ error: 'Failed to fetch available currencies' });
  }
});

// Get minimum exchange amount
router.post('/min-amount', async (req: Request, res: Response) => {
  try {
    const { fromCurrency, toCurrency } = MinAmountRequestSchema.parse(req.body);
    
    const response = await fetch(`${CHANGE_NOW_API_BASE}/min-amount/${fromCurrency}_${toCurrency}?api_key=${process.env.CHANGE_NOW_API_KEY || ''}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error fetching minimum amount:', errorText);
      return res.status(response.status).json({ 
        error: 'Failed to fetch minimum exchange amount',
        details: errorText
      });
    }
    
    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Error fetching minimum amount:', error);
    return res.status(500).json({ error: 'Failed to fetch minimum exchange amount' });
  }
});

// Get exchange range
router.post('/exchange-range', async (req: Request, res: Response) => {
  try {
    const { fromCurrency, toCurrency, fromAmount } = ExchangeRangeRequestSchema.parse(req.body);
    
    if (!fromAmount) {
      // If no amount is provided, get the min/max range
      const url = `${CHANGE_NOW_API_BASE}/exchange-range/${fromCurrency}_${toCurrency}?api_key=${process.env.CHANGE_NOW_API_KEY || ''}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null) || await response.text();
        console.error('Error fetching exchange range:', errorData);
        return res.status(response.status).json({ 
          error: 'Failed to fetch exchange range information',
          details: errorData
        });
      }
      
      const data = await response.json();
      return res.json(data);
    } else {
      // If amount is provided, get the estimated exchange amount
      const url = `${CHANGE_NOW_API_BASE}/exchange-amount/${fromAmount}/${fromCurrency}_${toCurrency}?api_key=${process.env.CHANGE_NOW_API_KEY || ''}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null) || await response.text();
        console.error('Error fetching exchange range:', errorData);
        return res.status(response.status).json({ 
          error: 'Failed to fetch exchange range information',
          details: errorData
        });
      }
      
      const data = await response.json() as any;
      console.log('Exchange amount response:', data);
      
      // Format the response to match what our frontend expects
      return res.json({
        fromAmount: fromAmount,
        toAmount: data.estimatedAmount ? data.estimatedAmount.toString() : "0",
        flow: "standard",
        rate: data.rate ? data.rate.toString() : "0",
        validUntil: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes from now
        transactionSpeedForecast: "10 minutes"
      });
    }
  } catch (error) {
    console.error('Error fetching exchange range:', error);
    return res.status(500).json({ error: 'Failed to fetch exchange range' });
  }
});

// Create exchange transaction
router.post('/create-exchange', async (req: Request, res: Response) => {
  try {
    const {
      fromCurrency,
      toCurrency,
      fromAmount,
      toAmount,
      address,
      extraId,
      refundAddress,
      refundExtraId,
      userId,
      payload,
      contactEmail
    } = CreateExchangeRequestSchema.parse(req.body);
    
    // Validate minimum amount first
    const minAmountResponse = await fetch(`${CHANGE_NOW_API_BASE}/min-amount/${fromCurrency}_${toCurrency}?api_key=${process.env.CHANGE_NOW_API_KEY || ''}`);
    
    if (!minAmountResponse.ok) {
      const errorText = await minAmountResponse.text();
      console.error('Error fetching minimum amount:', errorText);
      return res.status(minAmountResponse.status).json({ 
        error: 'Failed to validate minimum exchange amount',
        details: errorText
      });
    }
    
    const minAmountData = await minAmountResponse.json() as any;
    
    if (parseFloat(fromAmount) < minAmountData.minAmount) {
      return res.status(400).json({
        error: 'Amount too low',
        details: `Minimum required amount is ${minAmountData.minAmount} ${fromCurrency.toUpperCase()}`
      });
    }
    
    // Prepare request body
    const requestBody: any = {
      from: fromCurrency,
      to: toCurrency,
      amount: fromAmount,
      address,
    };
    
    // Add optional fields if provided
    if (extraId) requestBody.extraId = extraId;
    if (refundAddress) requestBody.refundAddress = refundAddress;
    if (refundExtraId) requestBody.refundExtraId = refundExtraId;
    if (userId) requestBody.userId = userId;
    if (payload) requestBody.payload = payload;
    if (contactEmail) requestBody.contactEmail = contactEmail;
    
    console.log('Creating exchange with payload:', requestBody);
    
    // Use API key in the header
    const response = await fetch(`${CHANGE_NOW_API_BASE}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CHANGE_NOW_API_KEY || ''
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = await response.text();
      }
      
      console.error('Error creating exchange transaction:', errorData);
      return res.status(response.status).json({ 
        error: 'Failed to create exchange transaction',
        details: errorData
      });
    }
    
    const data = await response.json();
    console.log('Exchange created successfully:', data);
    return res.json(data);
  } catch (error) {
    console.error('Error creating exchange:', error);
    return res.status(500).json({ error: 'Failed to create exchange transaction' });
  }
});

// Get transaction status
router.get('/transaction-status/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const response = await fetch(`${CHANGE_NOW_API_BASE}/transactions/${id}?api_key=${process.env.CHANGE_NOW_API_KEY || ''}`);
    
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = await response.text();
      }
      
      console.error('Error fetching transaction status:', errorData);
      return res.status(response.status).json({ 
        error: 'Failed to fetch transaction status',
        details: errorData
      });
    }
    
    const data = await response.json() as any;
    console.log('Transaction status response:', data);
    
    // Format the response according to our needs
    const formattedResponse = {
      id: data.id || id,
      status: data.status || 'unknown',
      fromCurrency: data.fromCurrency || data.from || '',
      toCurrency: data.toCurrency || data.to || '',
      fromAmount: data.fromAmount || data.amount || '0',
      toAmount: data.toAmount || data.expectedReceiveAmount || '0',
      fromAddress: data.fromAddress || data.payinAddress || '',
      toAddress: data.toAddress || data.payoutAddress || '',
      payinAddress: data.payinAddress || '',
      payoutAddress: data.payoutAddress || '',
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString()
    };
    
    return res.json(formattedResponse);
  } catch (error) {
    console.error('Error fetching transaction status:', error);
    return res.status(500).json({ error: 'Failed to fetch transaction status' });
  }
});

export default router;