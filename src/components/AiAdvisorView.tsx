import React, { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Send,
  Sparkles,
  TrendingUp,
  Clock,
  Pill,
} from 'lucide-react';
import type { BusinessAIResponse, PharmacyDatabase, StaffUser } from '../types';
import { api, formatMoney } from '../lib/api';

interface AiAdvisorViewProps {
  db: PharmacyDatabase;
  activeBranchId: string;
  currentUser: StaffUser;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
}

const QUICK_PROMPTS = [
  'Which medicines in this branch need urgent restocking or inter-branch transfer?',
  'Check interaction risk between Warfarin, Ibuprofen, and Omeprazole.',
  'How should we prioritize collecting our unpaid customer debts this week?',
  'Suggest safe OTC alternatives for fever in a patient with stomach ulcer history.',
];

export const AiAdvisorView: React.FC<AiAdvisorViewProps> = ({
  db,
  activeBranchId,
  currentUser,
  onNotify,
}) => {
  const [scope, setScope] = useState<'ACTIVE' | 'ALL'>('ALL');
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insights, setInsights] = useState<BusinessAIResponse | null>(null);

  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [chatHistory, setChatHistory] = useState<
    Array<{ role: 'user' | 'assistant'; text: string }>
  >([]);

  const sym = db.settings.currencySymbol;

  if (!currentUser.permissions['ai.use']) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          AI Decision Advisor is restricted for role "{currentUser.role}".
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Ask an Owner or Branch Manager to enable "ai.use" permission in Access Control.
        </p>
      </div>
    );
  }

  const handleAnalyzeBusiness = async () => {
    setLoadingInsights(true);
    try {
      const data = await api.businessInsights(scope === 'ALL' ? 'ALL' : activeBranchId);
      setInsights(data);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'AI analysis failed.', 'error');
    } finally {
      setLoadingInsights(false);
    }
  };

  const handleAsk = async (promptText?: string) => {
    const q = (promptText ?? question).trim();
    if (!q) return;
    setChatHistory((prev) => [...prev, { role: 'user', text: q }]);
    if (!promptText) setQuestion('');
    setAsking(true);
    try {
      const res = await api.askCopilot(q, activeBranchId);
      setChatHistory((prev) => [...prev, { role: 'assistant', text: res.answer }]);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'AI query failed.', 'error');
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {/* Left: Business & Inventory AI Decisions */}
      <div className="space-y-4 lg:col-span-7">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                AI Business &amp; Inventory Intelligence
              </h2>
              <p className="text-xs text-slate-500">
                Analyzes live branch stock, expiry windows, profit margins, and customer debt aging.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setScope('ALL')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    scope === 'ALL'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  All Branches
                </button>
                <button
                  type="button"
                  onClick={() => setScope('ACTIVE')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    scope === 'ACTIVE'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Active Branch
                </button>
              </div>
              <button
                type="button"
                disabled={loadingInsights}
                onClick={handleAnalyzeBusiness}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {loadingInsights ? 'Analyzing...' : 'Run AI Analysis'}
              </button>
            </div>
          </div>

          {!insights && !loadingInsights && (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
              <BarChart3 className="mx-auto h-8 w-8 text-emerald-700 dark:text-emerald-400" />
              <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                Ready to evaluate live pharmacy data
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Click "Run AI Analysis" to get restock quantities, expiry clearance tips, and debt recovery actions.
              </p>
            </div>
          )}

          {loadingInsights && (
            <div className="mt-5 space-y-3">
              <div className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
              <div className="h-28 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
              <div className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            </div>
          )}

          {insights && !loadingInsights && (
            <div className="mt-5 space-y-5">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  Executive Briefing
                </div>
                {insights.executiveSummary}
              </div>

              {/* Restock Priorities */}
              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  Restock Priorities
                </h3>
                <div className="mt-2 space-y-2">
                  {insights.restockPriorities.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                    >
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {item.medicineName} · <span className="text-slate-500">{item.branchName}</span>
                        </div>
                        <div className="mt-0.5 text-slate-600 dark:text-slate-400">
                          {item.rationale}
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="font-bold text-emerald-700 dark:text-emerald-400">
                          Order +{item.suggestedOrderQty}
                        </div>
                        <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                          {item.urgency}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Expiry & Debt Insights */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <Clock className="h-3.5 w-3.5 text-rose-600" />
                    Expiry Mitigation
                  </h3>
                  <div className="mt-2 space-y-2">
                    {insights.expiryActions.map((exp, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                      >
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {exp.medicineName} ({exp.expiryDate})
                        </div>
                        <div className="text-slate-500">{exp.branchName}</div>
                        <div className="mt-1 text-slate-700 dark:text-slate-300">
                          {exp.recommendedAction}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                    Debt Recovery Strategy
                  </h3>
                  <div className="mt-2 space-y-2">
                    {insights.debtInsights.map((d, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                      >
                        <div className="flex justify-between font-semibold text-slate-900 dark:text-white">
                          <span>{d.customerName}</span>
                          <span className="font-mono text-rose-600">
                            {formatMoney(d.outstandingBalance, sym)}
                          </span>
                        </div>
                        <div className="mt-1 text-slate-600 dark:text-slate-300">
                          {d.collectionStrategy}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {insights.profitOpportunities.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Margin &amp; Growth Recommendations
                  </div>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-slate-600 dark:text-slate-300">
                    {insights.profitOpportunities.map((op, i) => (
                      <li key={i}>{op}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: Clinical & Operations Copilot */}
      <div className="lg:col-span-5">
        <div className="flex h-[580px] flex-col rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Pill className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Medicine &amp; Business Copilot
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Ask about drug interactions, dosing, branch stock, or credit decisions.
            </p>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {chatHistory.length === 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-500">Suggested clinical &amp; business questions:</div>
                {QUICK_PROMPTS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAsk(p)}
                    className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-xs font-medium text-slate-700 hover:border-emerald-400 hover:bg-emerald-50/40 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            {chatHistory.map((msg, idx) => (
              <div
                key={idx}
                className={`rounded-xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'ml-8 bg-slate-900 text-white dark:bg-emerald-700'
                    : 'mr-4 border border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100'
                }`}
              >
                {msg.text}
              </div>
            ))}
            {asking && (
              <div className="mr-4 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800">
                Consulting clinical &amp; branch records...
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk();
            }}
            className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-800"
          >
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask medicine or business question..."
              className="min-h-[42px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-800"
            />
            <button
              type="submit"
              disabled={asking || !question.trim()}
              className="inline-flex min-h-[42px] min-w-[44px] items-center justify-center rounded-lg bg-emerald-700 px-3.5 text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
