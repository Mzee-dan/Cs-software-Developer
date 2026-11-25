import { GoogleGenAI, Type } from '@google/genai';
import type {
  BusinessAIResponse,
  ClinicalAIResponse,
  PharmacyDatabase,
} from '../src/types';

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add your API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function runClinicalCheck(params: {
  items: Array<{
    name: string;
    genericName: string;
    strength: string;
    activeIngredient: string;
    quantity: number;
  }>;
  patientContext?: string;
  availableCatalogNames: string[];
}): Promise<ClinicalAIResponse> {
  const ai = getClient();
  const prompt = [
    'Analyze the following pharmacy dispensing cart for clinical safety, drug-to-drug interactions, patient counseling points, and therapeutic alternatives.',
    `Cart Medicines: ${JSON.stringify(params.items)}`,
    params.patientContext
      ? `Patient Context / Allergies / Notes: ${params.patientContext}`
      : 'Patient Context: General adult outpatient, no extra conditions specified.',
    `Other medicines stocked in this pharmacy: ${params.availableCatalogNames.join(', ')}`,
    'Be concise, medically accurate, and practical for a dispensing pharmacist.',
  ].join('\n\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'You are a senior clinical pharmacist decision-support assistant. Return strictly valid JSON matching the requested schema. Never invent fake lab values. Highlight genuine pharmacological interactions (e.g., Warfarin + Ibuprofen bleeding risk, Omeprazole + Clopidogrel, Macrolides QT risk, Penicillin cross-reactivity).',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallRisk: {
            type: Type.STRING,
            description: 'One of: LOW, MODERATE, HIGH',
          },
          summary: {
            type: Type.STRING,
            description: '2-sentence clinical overview for the dispensing pharmacist.',
          },
          interactions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                pair: { type: Type.STRING },
                severity: { type: Type.STRING },
                explanation: { type: Type.STRING },
                recommendation: { type: Type.STRING },
              },
            },
          },
          counselingPoints: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          alternativeSuggestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                medicineName: { type: Type.STRING },
                reason: { type: Type.STRING },
              },
            },
          },
        },
      },
    },
  });

  const text = (response.text ?? '{}').trim();
  const parsed = JSON.parse(text) as ClinicalAIResponse;
  return {
    overallRisk: parsed.overallRisk || 'LOW',
    summary: parsed.summary || 'Clinical review completed.',
    interactions: Array.isArray(parsed.interactions) ? parsed.interactions : [],
    counselingPoints: Array.isArray(parsed.counselingPoints) ? parsed.counselingPoints : [],
    alternativeSuggestions: Array.isArray(parsed.alternativeSuggestions)
      ? parsed.alternativeSuggestions
      : [],
  };
}

export async function runBusinessInsights(
  db: PharmacyDatabase,
  activeBranchId: string | 'ALL'
): Promise<BusinessAIResponse> {
  const ai = getClient();

  const branchMap = Object.fromEntries(db.branches.map((b) => [b.id, b.name]));
  const stockSnapshot = db.medicines
    .filter((m) => m.enabled)
    .flatMap((m) =>
      Object.entries(m.branchStock)
        .filter(([bId]) => activeBranchId === 'ALL' || bId === activeBranchId)
        .map(([bId, lot]) => ({
          medicine: `${m.name} (${m.strength})`,
          branch: branchMap[bId] || bId,
          qty: lot.quantity,
          reorderLevel: lot.reorderLevel,
          expiryDate: lot.expiryDate,
          marginPct:
            m.sellingPrice > 0
              ? Math.round(((m.sellingPrice - m.costPrice) / m.sellingPrice) * 100)
              : 0,
        }))
    );

  const invoiceSnapshot = db.invoices
    .filter((inv) => inv.enabled && inv.paymentStatus !== 'VOID')
    .filter((inv) => activeBranchId === 'ALL' || inv.branchId === activeBranchId)
    .map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      branch: inv.branchName,
      customer: inv.customerName,
      grandTotal: inv.grandTotal,
      amountPaid: inv.amountPaid,
      balanceDue: inv.balanceDue,
      status: inv.paymentStatus,
      dueDate: inv.dueDate,
    }));

  const debtSnapshot = db.customers
    .filter((c) => c.currentDebt > 0)
    .map((c) => ({
      name: c.name,
      type: c.type,
      debt: c.currentDebt,
      creditLimit: c.creditLimit,
    }));

  const prompt = [
    `Analyze this live pharmacy telemetry (Scope: ${activeBranchId === 'ALL' ? 'All Branches' : branchMap[activeBranchId] || activeBranchId}) and generate concrete business, inventory, expiry, and debt-recovery decisions.`,
    `Currency: ${db.settings.currencyCode} (${db.settings.currencySymbol}), Today's Date: ${new Date().toISOString().slice(0, 10)}`,
    `Inventory Lots: ${JSON.stringify(stockSnapshot)}`,
    `Invoices: ${JSON.stringify(invoiceSnapshot)}`,
    `Customer Debts: ${JSON.stringify(debtSnapshot)}`,
  ].join('\n\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'You are an executive pharmacy operations and financial analyst. Use the exact medicine names, branch names, customer names, and numeric figures provided in the data. Return strictly valid JSON matching the schema.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          executiveSummary: { type: Type.STRING },
          restockPriorities: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                medicineName: { type: Type.STRING },
                branchName: { type: Type.STRING },
                suggestedOrderQty: { type: Type.INTEGER },
                urgency: { type: Type.STRING },
                rationale: { type: Type.STRING },
              },
            },
          },
          expiryActions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                medicineName: { type: Type.STRING },
                branchName: { type: Type.STRING },
                expiryDate: { type: Type.STRING },
                recommendedAction: { type: Type.STRING },
              },
            },
          },
          debtInsights: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                customerName: { type: Type.STRING },
                outstandingBalance: { type: Type.NUMBER },
                riskLevel: { type: Type.STRING },
                collectionStrategy: { type: Type.STRING },
              },
            },
          },
          profitOpportunities: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
      },
    },
  });

  const text = (response.text ?? '{}').trim();
  const parsed = JSON.parse(text) as BusinessAIResponse;
  return {
    executiveSummary: parsed.executiveSummary || 'Business analysis completed.',
    restockPriorities: Array.isArray(parsed.restockPriorities) ? parsed.restockPriorities : [],
    expiryActions: Array.isArray(parsed.expiryActions) ? parsed.expiryActions : [],
    debtInsights: Array.isArray(parsed.debtInsights) ? parsed.debtInsights : [],
    profitOpportunities: Array.isArray(parsed.profitOpportunities) ? parsed.profitOpportunities : [],
  };
}

export async function runPharmacyCopilot(
  db: PharmacyDatabase,
  question: string,
  activeBranchId: string
): Promise<string> {
  const ai = getClient();
  const branch = db.branches.find((b) => b.id === activeBranchId);
  const lowStock = db.medicines
    .filter((m) => {
      const lot = m.branchStock[activeBranchId];
      return lot && lot.quantity <= lot.reorderLevel;
    })
    .map((m) => `${m.name} (${m.branchStock[activeBranchId].quantity} left)`);
  const debtors = db.customers
    .filter((c) => c.currentDebt > 0)
    .map((c) => `${c.name}: ${db.settings.currencySymbol}${c.currentDebt.toFixed(2)}`);

  const contextSummary = [
    `Pharmacy: ${db.settings.pharmacyName} | Active Branch: ${branch?.name ?? activeBranchId}`,
    `Low stock in active branch: ${lowStock.join(', ') || 'None'}`,
    `Active customer debts: ${debtors.join(', ') || 'None'}`,
    `Catalog medicines: ${db.medicines.map((m) => `${m.name} ${m.strength} (${db.settings.currencySymbol}${m.sellingPrice})`).join(', ')}`,
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Context:\n${contextSummary}\n\nQuestion from pharmacist/manager:\n${question}`,
    config: {
      systemInstruction:
        'You are Botanica Rx Clinical & Business Advisor. Give clear, concise, actionable guidance on pharmacology, drug interactions, inventory optimization, branch transfers, and credit risk. Use plain clean prose and bullet points.',
    },
  });

  return response.text ?? 'No response generated.';
}
