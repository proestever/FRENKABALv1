// Script to generate public codes for existing portfolios
import { db } from "../db";
import { portfolios } from "@shared/schema";
import { generatePublicCode } from "../utils/public-code";
import { isNull, eq } from "drizzle-orm";

async function generateCodesForExistingPortfolios() {
  try {
    // Get all portfolios without public codes
    const portfoliosWithoutCodes = await db
      .select()
      .from(portfolios)
      .where(isNull(portfolios.publicCode));
    
    console.log(`Found ${portfoliosWithoutCodes.length} portfolios without public codes`);
    
    // Generate unique codes for each portfolio
    for (const portfolio of portfoliosWithoutCodes) {
      let publicCode = generatePublicCode();
      
      // Check if code already exists
      let existingPortfolio = await db
        .select()
        .from(portfolios)
        .where(eq(portfolios.publicCode, publicCode))
        .limit(1);
      
      // Keep generating until we find a unique code
      while (existingPortfolio.length > 0) {
        publicCode = generatePublicCode();
        existingPortfolio = await db
          .select()
          .from(portfolios)
          .where(eq(portfolios.publicCode, publicCode))
          .limit(1);
      }
      
      // Update the portfolio with the new public code
      await db
        .update(portfolios)
        .set({ publicCode })
        .where(eq(portfolios.id, portfolio.id));
      
      console.log(`Generated code ${publicCode} for portfolio "${portfolio.name}" (ID: ${portfolio.id})`);
    }
    
    console.log("Successfully generated public codes for all portfolios");
  } catch (error) {
    console.error("Error generating portfolio codes:", error);
  } finally {
    process.exit(0);
  }
}

generateCodesForExistingPortfolios();