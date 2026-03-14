/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Home, 
  History, 
  Wallet, 
  Settings, 
  PlusCircle, 
  Bell, 
  Bitcoin,
  ArrowLeft,
  Share2,
  Printer,
  CheckCircle,
  Lock,
  Info,
  Ticket,
  Gift,
  Timer,
  Delete,
  ArrowRight,
  Download,
  Eraser,
  X,
  Search,
  Filter
} from 'lucide-react';
import { Screen, Voucher, CurrencyCode } from './types';
import { INITIAL_VOUCHERS, BTC_PRICE, CURRENCIES } from './constants';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background-dark flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full space-y-6">
            <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto">
              <X className="text-rose-500" size={40} />
            </div>
            <h1 className="text-2xl font-bold text-slate-100">Something went wrong</h1>
            <p className="text-slate-400 text-sm">
              The application encountered an unexpected error. Please try refreshing the page.
            </p>
            <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl text-left overflow-auto max-h-40">
              <p className="text-xs font-mono text-primary/60 break-all">
                {this.state.error?.message}
              </p>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-primary text-background-dark rounded-xl font-bold uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-transform"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');
  const [vouchers, setVouchers] = useState<Voucher[]>(INITIAL_VOUCHERS);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | undefined>(vouchers[0]);
  const [amountInput, setAmountInput] = useState('1.00');
  const [walletApi, setWalletApi] = useState('');
  const [walletId, setWalletId] = useState('');
  const [isServerConfigured, setIsServerConfigured] = useState(false);
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState<CurrencyCode>('USD');

  useEffect(() => {
    const checkConfig = async () => {
      try {
        const response = await fetch('/api/wallet/balance');
        if (response.ok) {
          setIsServerConfigured(true);
        }
      } catch (e) {
        console.error("Config check failed:", e);
      }
    };
    checkConfig();
  }, []);

  const navigateTo = (screen: Screen, voucher?: Voucher) => {
    if (voucher) setSelectedVoucher(voucher);
    setCurrentScreen(screen);
  };

  const handleKeypad = (val: string) => {
    if (val === 'clear') {
      setAmountInput('0.00');
      return;
    }

    setAmountInput(prev => {
      // Cash till shifting logic: digits shift in from the right
      let digits = prev.replace('.', '').replace(/^0+/, '');
      
      if (val === 'backspace') {
        digits = digits.slice(0, -1);
      } else if (val === '.') {
        // In cash till mode, decimal is often ignored or used to jump to dollars
        // For simplicity and following "not more than two decimal places", we'll ignore it
        // or we could use it to append "00" if no decimal exists yet.
        return prev; 
      } else {
        // Prevent ridiculously large numbers
        if (digits.length >= 9) return prev;
        digits = digits + val;
      }

      if (digits.length === 0) return '0.00';
      if (digits.length === 1) return '0.0' + digits;
      if (digits.length === 2) return '0.' + digits;
      return digits.slice(0, -2) + '.' + digits.slice(-2);
    });
  };

  const handleCreateVoucher = async (type: 'standard' | 'gift') => {
    const currency = CURRENCIES.find(c => c.code === selectedCurrencyCode) || CURRENCIES[0];
    const amountInCurrency = parseFloat(amountInput);
    const amountUsd = amountInCurrency / currency.rate;
    const amountBtc = parseFloat((amountUsd / BTC_PRICE).toFixed(8));
    
    try {
      const response = await fetch('/api/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountBtc, amountUsd, type })
      });
      
      if (!response.ok) throw new Error('Failed to create voucher');
      
      const newVoucher = await response.json();
      setVouchers(prev => [newVoucher, ...prev]);
      setAmountInput('0.00');
      navigateTo('voucher-details', newVoucher);
    } catch (error) {
      console.error('Error creating voucher:', error);
      // Fallback to local creation if backend fails (for demo)
      const fallbackVoucher: Voucher = {
        id: Math.random().toString(36).substr(2, 9).toUpperCase(),
        amountUsd: amountUsd,
        amountBtc: amountBtc,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        status: 'active',
        type: type
      };
      setVouchers(prev => [fallbackVoucher, ...prev]);
      setAmountInput('0.00');
      navigateTo('voucher-details', fallbackVoucher);
    }
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'dashboard':
        return <Dashboard navigateTo={navigateTo} vouchers={vouchers} walletApi={walletApi} walletId={walletId} currencyCode={selectedCurrencyCode} isServerConfigured={isServerConfigured} />;
      case 'create-voucher':
        return <CreateVoucher navigateTo={navigateTo} amount={amountInput} onKeypad={handleKeypad} currencyCode={selectedCurrencyCode} onCreate={handleCreateVoucher} />;
      case 'voucher-details':
        return <VoucherDetails navigateTo={navigateTo} voucher={selectedVoucher} currencyCode={selectedCurrencyCode} />;
      case 'print-receipt':
        return <PrintReceipt navigateTo={navigateTo} voucher={selectedVoucher} currencyCode={selectedCurrencyCode} />;
      case 'printer-config':
        return <PrinterConfig navigateTo={navigateTo} />;
      case 'settings':
        return (
          <SettingsPage 
            navigateTo={navigateTo} 
            walletApi={walletApi} 
            setWalletApi={setWalletApi} 
            walletId={walletId} 
            setWalletId={setWalletId} 
            currencyCode={selectedCurrencyCode}
            setCurrencyCode={setSelectedCurrencyCode}
            isServerConfigured={isServerConfigured}
          />
        );
      case 'vouchers-list':
        return <VouchersList navigateTo={navigateTo} vouchers={vouchers} currencyCode={selectedCurrencyCode} />;
      default:
        return <Dashboard navigateTo={navigateTo} vouchers={vouchers} walletApi={walletApi} walletId={walletId} currencyCode={selectedCurrencyCode} isServerConfigured={isServerConfigured} />;
    }
  };

  return (
    <div className="min-h-screen bg-background-dark text-slate-100 flex flex-col max-w-md mx-auto shadow-2xl border-x border-primary/10 relative overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentScreen}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="flex-1 flex flex-col"
        >
          {renderScreen()}
        </motion.div>
      </AnimatePresence>

      {/* Bottom Navigation - Only visible on main screens */}
      {['dashboard', 'printer-config', 'settings'].includes(currentScreen) && (
        <nav className="sticky bottom-0 left-0 right-0 border-t border-primary/10 bg-background-dark/95 backdrop-blur-md z-20 px-4 pb-6 pt-2">
          <div className="flex items-center justify-around h-16">
            <NavButton 
              icon={<Home size={24} />} 
              label="Home" 
              active={currentScreen === 'dashboard'} 
              onClick={() => navigateTo('dashboard')} 
            />
            <NavButton 
              icon={<Printer size={24} />} 
              label="Printer" 
              active={currentScreen === 'printer-config'} 
              onClick={() => navigateTo('printer-config')} 
            />
            <NavButton 
              icon={<Settings size={24} />} 
              label="Settings" 
              active={currentScreen === 'settings'} 
              onClick={() => navigateTo('settings')} 
            />
          </div>
        </nav>
      )}
    </div>
  );
}

function Logo() {
  return (
    <svg 
      viewBox="0 0 500 500" 
      className="w-8 h-8 rounded-lg"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="0" y="0" width="500" height="500" rx="80" ry="80" fill="#FFD000"/>
      <circle cx="250" cy="250" r="190" fill="#C8C8C8" stroke="#0D0D0D" strokeWidth="12"/>
      <polygon
        points="285,30  175,270  245,270  215,470  325,230  255,230"
        fill="#FFD000"
        stroke="#0D0D0D"
        strokeWidth="10"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 transition-colors ${active ? 'text-primary' : 'text-slate-500'}`}
    >
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
}

function Dashboard({ 
  navigateTo, 
  vouchers, 
  walletApi, 
  walletId,
  currencyCode,
  isServerConfigured: serverProp
}: { 
  navigateTo: (s: Screen, v?: Voucher) => void, 
  vouchers: Voucher[],
  walletApi: string,
  walletId: string,
  currencyCode: CurrencyCode,
  isServerConfigured: boolean
}) {
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isServerConfigured, setIsServerConfigured] = useState(serverProp);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'vouchers' | 'wallet'>('vouchers');

  // Sync state with prop
  useEffect(() => {
    setIsServerConfigured(serverProp);
  }, [serverProp]);

  const isLocalConfigured = walletApi.trim() !== '' && walletId.trim() !== '';
  const currency = CURRENCIES.find(c => c.code === currencyCode) || CURRENCIES[0];

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const [balanceRes, txRes] = await Promise.all([
        fetch('/api/wallet/balance'),
        fetch('/api/wallet/transactions')
      ]);
      
      if (balanceRes.ok) {
        const data = await balanceRes.json();
        setBalance(data.balanceBtc);
        setIsServerConfigured(true);
      } else {
        setIsServerConfigured(false);
        if (isLocalConfigured) {
          setBalance(0.04258120);
        } else {
          setBalance(null);
        }
      }

      if (txRes.ok) {
        const data = await txRes.json();
        setTransactions(data.transactions);
      }
    } catch (error: any) {
      console.error("Dashboard: Failed to fetch data:", error);
      setIsServerConfigured(false);
      setError("Network error. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [isLocalConfigured, walletApi, walletId, serverProp]);

  const showNotConfigured = !isServerConfigured && !isLocalConfigured;

  return (
    <div className="flex-1 flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-primary/10 sticky top-0 z-10 bg-background-dark">
        <div className="flex items-center gap-3">
          <Logo />
          <h1 className="text-xl font-bold tracking-tight">Sats Vouchers</h1>
          {isServerConfigured && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="text-[8px] text-emerald-500 font-bold uppercase tracking-tighter">Blink Connected</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={fetchData}
            disabled={isLoading}
            className={`p-2 rounded-full hover:bg-primary/10 transition-colors ${isLoading ? 'animate-spin text-primary' : 'text-slate-400'}`}
          >
            <Timer size={20} />
          </button>
          <button className="p-2 rounded-full hover:bg-primary/10 transition-colors">
            <Bell className="text-slate-400" size={24} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="grid grid-cols-1 gap-4">
          <div className="flex flex-col gap-2 rounded-xl p-6 bg-primary/10 border border-primary/20 shadow-sm min-h-[140px] justify-center relative overflow-hidden">
            {isLoading && (
              <div className="absolute top-0 left-0 w-full h-1 bg-primary/20">
                <motion.div 
                  className="h-full bg-primary"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-slate-400 text-sm font-medium">BTC Balance</p>
              {!showNotConfigured && !isLoading && (
                <span className="text-emerald-500 text-xs font-bold bg-emerald-500/10 px-2 py-1 rounded-full">Live</span>
              )}
            </div>
            
            {showNotConfigured ? (
              <div className="py-2">
                <p className="text-slate-500 text-sm italic">Wallet not configured</p>
                <button 
                  onClick={() => navigateTo('settings')}
                  className="text-primary text-xs font-bold uppercase tracking-wider mt-1 hover:underline"
                >
                  Configure in Settings →
                </button>
              </div>
            ) : isLoading && balance === null ? (
              <div className="flex items-center gap-2 py-2">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-slate-500 text-sm">Fetching balance...</p>
              </div>
            ) : (
              <>
                <p className="text-3xl font-bold leading-tight">
                  {balance !== null ? balance.toFixed(8) : '0.00000000'} <span className="text-primary text-lg">BTC</span>
                </p>
                {error && (
                  <p className="text-[10px] text-rose-500 mt-1 font-medium">{error}</p>
                )}
                <div className="w-full h-1 bg-slate-800 rounded-full mt-2 overflow-hidden">
                  <div className="bg-primary h-full w-[100%]"></div>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-xl p-6 bg-primary/5 border border-primary/10 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-slate-400 text-sm font-medium">{currency.code} Equivalent</p>
            </div>
            {showNotConfigured || (isLoading && balance === null) ? (
              <p className="text-3xl font-bold leading-tight text-slate-700">---</p>
            ) : (
              <p className="text-3xl font-bold leading-tight">
                {currency.symbol}{((balance || 0) * BTC_PRICE * currency.rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
            <p className="text-slate-500 text-xs italic">Market price: {currency.symbol}{(BTC_PRICE * currency.rate).toLocaleString()}</p>
          </div>
        </div>

        <button 
          onClick={() => navigateTo('create-voucher')}
          className="w-full flex items-center justify-center gap-3 bg-primary hover:bg-primary/90 text-background-dark font-black py-4 px-6 rounded-xl transition-all shadow-lg shadow-primary/20 active:scale-[0.98]"
        >
          <PlusCircle size={24} />
          <span className="text-lg">Generate New Voucher</span>
        </button>

        <div className="space-y-4">
          <div className="flex items-center p-1 bg-primary/5 rounded-lg">
            <button 
              onClick={() => setActiveTab('vouchers')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${activeTab === 'vouchers' ? 'bg-primary text-background-dark shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
            >
              App Vouchers
            </button>
            <button 
              onClick={() => setActiveTab('wallet')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${activeTab === 'wallet' ? 'bg-primary text-background-dark shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Wallet Activity
            </button>
          </div>

          {activeTab === 'vouchers' ? (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold tracking-tight">Recent Vouchers</h3>
                <button 
                  onClick={() => navigateTo('vouchers-list')}
                  className="text-primary text-sm font-medium hover:underline"
                >
                  View All
                </button>
              </div>
              <div className="flex flex-col divide-y divide-primary/10">
                {vouchers.map((v) => (
                  <div 
                    key={v.id} 
                    onClick={() => navigateTo('voucher-details', v)}
                    className="flex items-center justify-between p-4 hover:bg-primary/5 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${
                        v.status === 'active' ? 'bg-emerald-500/20 text-emerald-500' : 
                        v.status === 'printed' ? 'bg-primary/20 text-primary' : 'bg-slate-500/20 text-slate-500'
                      }`}>
                        {v.status === 'active' ? <CheckCircle size={20} /> : v.status === 'printed' ? <Printer size={20} /> : <Lock size={20} />}
                      </div>
                      <div>
                        <p className="font-semibold">{v.amountBtc} BTC</p>
                        <p className="text-xs text-slate-400">{v.date} • ID: {v.id}</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider ${
                      v.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 
                      v.status === 'printed' ? 'bg-primary/10 text-primary' : 'bg-slate-500/10 text-slate-500'
                    }`}>
                      {v.status}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold tracking-tight">Wallet Transactions</h3>
                <span className="text-slate-500 text-xs uppercase tracking-widest font-bold">Latest 10</span>
              </div>
              <div className="flex flex-col divide-y divide-primary/10">
                {transactions.length > 0 ? (
                  transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between p-4 hover:bg-primary/5 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${tx.settlementAmount > 0 ? 'bg-emerald-500/20 text-emerald-500' : 'bg-rose-500/20 text-rose-500'}`}>
                          {tx.settlementAmount > 0 ? <PlusCircle size={20} /> : <History size={20} />}
                        </div>
                        <div>
                          <p className="font-semibold">
                            {tx.settlementAmount > 0 ? '+' : ''}{(tx.settlementAmount / 100000000).toFixed(8)} BTC
                          </p>
                          <p className="text-xs text-slate-400">
                            {new Date(tx.createdAt * 1000).toLocaleDateString()} • {tx.memo || 'No memo'}
                          </p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider ${
                        tx.status === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                      }`}>
                        {tx.status}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center">
                    <p className="text-slate-500 text-sm italic">No wallet activity found</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="bg-gradient-to-br from-primary/20 to-transparent p-6 rounded-xl border border-primary/20">
          <div className="flex items-start gap-4">
            <Info className="text-primary shrink-0" size={28} />
            <div>
              <h4 className="font-bold">Security Tip</h4>
              <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                Never share your voucher codes with anyone. Sats Vouchers employees will never ask for your private keys or voucher IDs via email or phone.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function CreateVoucher({ navigateTo, amount, onKeypad, currencyCode, onCreate }: { navigateTo: (s: Screen) => void, amount: string, onKeypad: (v: string) => void, currencyCode: CurrencyCode, onCreate: (type: 'standard' | 'gift') => void }) {
  const [step, setStep] = useState(1);
  const [type, setType] = useState<'standard' | 'gift'>('standard');

  const currency = CURRENCIES.find(c => c.code === currencyCode) || CURRENCIES[0];
  const btcValue = (parseFloat(amount) / (BTC_PRICE * currency.rate)).toFixed(8);

  return (
    <div className="flex-1 flex flex-col">
      <header className="flex items-center p-4 justify-between border-b border-primary/10 bg-background-dark sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigateTo('dashboard')} className="p-2 hover:bg-primary/10 rounded-full transition-colors">
            <ArrowLeft className="text-slate-100" size={24} />
          </button>
          <Logo />
        </div>
        <h2 className="text-lg font-bold flex-1 text-center pr-20">Create Voucher</h2>
      </header>

      <div className="flex w-full flex-row items-center justify-center gap-3 py-4">
        <div className={`h-2 rounded-full transition-all ${step >= 1 ? 'w-8 bg-primary' : 'w-2 bg-primary/20'}`}></div>
        <div className={`h-2 rounded-full transition-all ${step >= 2 ? 'w-8 bg-primary' : 'w-2 bg-primary/20'}`}></div>
        <div className={`h-2 rounded-full transition-all ${step >= 3 ? 'w-8 bg-primary' : 'w-2 bg-primary/20'}`}></div>
      </div>

      <main className="flex-1 overflow-y-auto px-4 pb-32">
        {step === 1 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="tracking-tight text-3xl font-bold text-center pb-2 pt-4">Enter Amount</h1>
            <p className="text-primary/60 text-sm font-medium text-center mb-6">Choose how much Bitcoin to load</p>
            
            <div className="relative flex flex-col items-center justify-center py-8 rounded-2xl bg-primary/5 border border-primary/20 mb-8">
              <button 
                onClick={() => onKeypad('clear')}
                className="absolute top-4 right-4 p-2 text-primary/40 hover:text-primary transition-colors hover:bg-primary/10 rounded-full"
                title="Clear Amount"
              >
                <X size={20} />
              </button>
              <div className="flex items-baseline gap-1">
                <span className="text-primary text-2xl font-bold">{currency.symbol}</span>
                <span className="text-6xl font-black">{amount}</span>
                <span className="text-primary/60 text-xl font-bold ml-2">{currency.code}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 px-4 py-1 bg-primary/10 rounded-full">
                <Bitcoin className="text-primary" size={14} />
                <p className="text-primary text-sm font-bold tracking-wide">{btcValue} BTC</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <button 
                onClick={() => setType('standard')}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${type === 'standard' ? 'border-primary bg-primary/10' : 'border-transparent bg-primary/5'}`}
              >
                <Ticket className={`text-3xl mb-2 ${type === 'standard' ? 'text-primary' : 'text-primary/40'}`} />
                <span className="text-sm font-bold">Standard</span>
              </button>
              <button 
                onClick={() => setType('gift')}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${type === 'gift' ? 'border-primary bg-primary/10' : 'border-transparent bg-primary/5'}`}
              >
                <Gift className={`text-3xl mb-2 ${type === 'gift' ? 'text-primary' : 'text-primary/40'}`} />
                <span className="text-sm font-bold">Gift Wrap</span>
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-transparent hover:border-primary/20 cursor-pointer">
                <div className="flex items-center gap-3">
                  <Timer className="text-primary" />
                  <div className="flex flex-col">
                    <span className="text-sm font-bold">Set Expiry Date</span>
                    <span className="text-xs text-primary/40">Voucher remains valid for 1 year</span>
                  </div>
                </div>
                <div className="w-12 h-6 bg-primary/20 rounded-full relative">
                  <div className="absolute right-1 top-1 w-4 h-4 bg-primary rounded-full"></div>
                </div>
              </label>
            </div>
          </motion.div>
        )}
      </main>

      {/* Numeric Keypad */}
      <div className="absolute bottom-0 left-0 w-full bg-background-dark border-t border-primary/10 p-4 pb-8 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button 
              key={num}
              onClick={() => onKeypad(num)}
              className="h-12 flex items-center justify-center rounded-lg bg-primary/10 text-xl font-bold hover:bg-primary/20 active:scale-95 transition-all"
            >
              {num}
            </button>
          ))}
          <button 
            onClick={() => onKeypad('00')}
            className="h-12 flex items-center justify-center rounded-lg bg-primary/10 text-xl font-bold hover:bg-primary/20 active:scale-95 transition-all"
          >
            00
          </button>
          <button 
            key="0"
            onClick={() => onKeypad('0')}
            className="h-12 flex items-center justify-center rounded-lg bg-primary/10 text-xl font-bold hover:bg-primary/20 active:scale-95 transition-all"
          >
            0
          </button>
          <button 
            onClick={() => onKeypad('backspace')}
            className="h-12 flex items-center justify-center rounded-lg bg-primary/10 text-xl font-bold hover:bg-primary/20 active:scale-95 transition-all"
          >
            <Delete size={20} />
          </button>
        </div>
        <button 
          onClick={() => onCreate(type)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 px-4 text-background-dark font-black text-lg shadow-lg shadow-primary/20 active:scale-95 transition-transform"
        >
          <span>NEXT STEP</span>
          <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
}

function VoucherDetails({ navigateTo, voucher, currencyCode }: { navigateTo: (s: Screen) => void, voucher?: Voucher, currencyCode: CurrencyCode }) {
  if (!voucher) return null;

  const currency = CURRENCIES.find(c => c.code === currencyCode) || CURRENCIES[0];

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-10 bg-background-dark/80 backdrop-blur-md border-b border-primary/10">
        <div className="flex items-center p-4 justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigateTo('dashboard')} className="p-2 hover:bg-primary/10 rounded-full transition-colors">
              <ArrowLeft className="text-primary" size={24} />
            </button>
            <Logo />
            <h2 className="text-lg font-bold tracking-tight">Voucher Details</h2>
          </div>
          <button className="p-2 hover:bg-primary/10 rounded-full transition-colors">
            <Share2 className="text-primary" size={24} />
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 pb-24 space-y-8">
        <section>
          <h2 className="text-2xl font-bold mb-6">Print Preview</h2>
          <div className="voucher-grid relative overflow-hidden bg-slate-900 rounded-xl border-2 border-dashed border-primary/30 p-8 shadow-2xl">
            <div className="flex justify-between items-start mb-8">
              <div className="bg-primary p-3 rounded-lg shadow-lg">
                <Bitcoin className="text-background-dark" size={32} />
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Voucher Status</p>
                <p className="text-emerald-500 font-bold">READY TO REDEEM</p>
              </div>
            </div>

            <div className="space-y-6 mb-8 text-center">
              <div>
                <p className="text-slate-400 text-sm mb-1 uppercase tracking-tighter">Value in Bitcoin</p>
                <h3 className="text-4xl font-black text-primary">{voucher.amountBtc.toFixed(8)} BTC</h3>
              </div>
              <div className="bg-primary/5 py-3 rounded-lg">
                <p className="text-slate-400 text-xs uppercase mb-1">Equivalent Amount</p>
                <p className="text-xl font-bold">{currency.symbol}{(voucher.amountUsd * currency.rate).toFixed(2)} {currency.code}</p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-4 py-6 border-y border-slate-800">
              <div className="bg-white p-2 rounded-lg">
                <div className="w-32 h-32 flex items-center justify-center overflow-hidden">
                  {voucher.lnurl ? (
                    <QRCodeSVG value={voucher.lnurl} size={128} />
                  ) : (
                    <div className="w-full h-full bg-slate-200 flex items-center justify-center text-slate-500 text-[10px] text-center p-2">
                      QR Code Unavailable (Offline Mode)
                    </div>
                  )}
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500 mb-1">VOUCHER ID</p>
                <p className="font-mono text-lg font-bold tracking-widest">BTC-{voucher.id}</p>
              </div>
            </div>

            <div className="mt-8 flex justify-between items-center text-[10px] text-slate-400 uppercase tracking-widest">
              <p>Expires: Dec 31, 2024</p>
              <p>Verified Secure</p>
            </div>

            {/* Decorative punch holes */}
            <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-background-dark rounded-full"></div>
            <div className="absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-background-dark rounded-full"></div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="bg-primary/10 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Amount Paid</span>
              <span className="font-semibold">{currency.symbol}{(voucher.amountUsd * currency.rate).toFixed(2)} {currency.code}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Exchange Rate</span>
              <span className="font-semibold">1 BTC = {currency.symbol}{(BTC_PRICE * currency.rate).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Transaction Fee</span>
              <span className="font-semibold">{currency.symbol}{(2.50 * currency.rate).toFixed(2)} {currency.code}</span>
            </div>
            <div className="h-px bg-primary/20 my-1"></div>
            <div className="flex justify-between items-center">
              <span className="font-bold">Total Bitcoin</span>
              <span className="text-primary font-bold">{voucher.amountBtc.toFixed(8)} BTC</span>
            </div>
          </div>

          <button 
            onClick={() => navigateTo('print-receipt')}
            className="w-full bg-primary hover:bg-primary/90 text-background-dark font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20 active:scale-[0.98]"
          >
            <Printer size={20} />
            Print Voucher
          </button>
          <button className="w-full border border-primary/30 hover:bg-primary/5 text-primary font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-all">
            <Download size={20} />
            Save as PDF
          </button>
        </section>
      </main>
    </div>
  );
}

function PrintReceipt({ navigateTo, voucher, currencyCode }: { navigateTo: (s: Screen) => void, voucher?: Voucher, currencyCode: CurrencyCode }) {
  if (!voucher) return null;

  const currency = CURRENCIES.find(c => c.code === currencyCode) || CURRENCIES[0];

  return (
    <div className="flex-1 flex flex-col bg-white text-slate-900">
      <header className="flex items-center p-4 border-b border-slate-200 justify-between no-print">
        <div className="flex items-center gap-3">
          <button onClick={() => navigateTo('voucher-details')} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="text-primary" size={24} />
          </button>
          <Logo />
        </div>
        <h2 className="text-lg font-bold flex-1 text-center pr-20">Print Receipt</h2>
      </header>

      <main className="flex-1 flex flex-col items-center p-8 max-w-[58mm] mx-auto bg-white">
        <div className="text-center w-full mb-4 border-b-2 border-dashed border-slate-300 pb-4">
          <h2 className="text-xl font-black uppercase tracking-tighter">SATS VOUCHER</h2>
          <p className="text-slate-500 text-[10px] mt-1">Generated: {new Date().toLocaleString()}</p>
        </div>

        <div className="py-4 text-center">
          <h1 className="text-3xl font-black leading-none">{(voucher.amountBtc * 100000000).toLocaleString()} SATS</h1>
          <p className="text-slate-600 text-sm font-bold mt-2">Value: {currency.symbol}{(voucher.amountUsd * currency.rate).toFixed(2)} {currency.code}</p>
          <p className="text-slate-400 text-[10px] mt-1">({voucher.amountBtc.toFixed(8)} BTC)</p>
        </div>

        <div className="w-full aspect-square bg-white flex items-center justify-center my-4 border-2 border-slate-900 overflow-hidden">
          <img 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAL7fwmcqTYdvER8JkZZ12ypetPWIq8CMYr81Vj1fwqlVi9i3C8zyblEzk6a4TrYaIKFamFxBuexHWPhSTNor2snBFqkdw1LFMJmvy8Q9YOVldFwveJiabbA3TdCpqh7ODnOmByxM2VoCxMRYARvXQgEfJA0A7XrfPn6AgVSa2XHPJA0A3lnQxUs1TXfYy4kPYfnuvqlr2nMbtRQuPW9hOQPPEd2iKgAXjuKxYaguVe0uGQRWRZp0LnBsNM6NTGi4GizmTPlpqG8gU" 
            alt="QR Code" 
            className="w-full h-full grayscale contrast-150"
            referrerPolicy="no-referrer"
          />
        </div>

        <div className="w-full text-center space-y-1 mb-6">
          <p className="text-slate-500 text-[10px] uppercase tracking-widest">Voucher ID</p>
          <h2 className="text-sm font-bold tracking-tighter">SATS-{voucher.id}</h2>
        </div>

        <div className="w-full bg-slate-100 p-3 rounded text-center mb-6">
          <p className="text-xs font-bold uppercase mb-1">One-time use</p>
          <p className="text-slate-600 text-[11px] leading-tight">scan with your lightning wallet to claim funds</p>
        </div>

        <div className="w-full border-t-2 border-dashed border-slate-300 pt-4 text-center">
          <p className="text-slate-500 text-[9px]">Thank you for using our Bitcoin ATM</p>
          <p className="text-slate-500 text-[9px] font-bold">satsvouchers.io</p>
        </div>
      </main>

      <div className="p-4 border-t border-slate-200 flex gap-3 no-print bg-background-dark">
        <button className="flex-1 bg-slate-800 text-slate-100 font-bold py-4 rounded-xl flex items-center justify-center gap-2">
          <Share2 size={20} />
          Share
        </button>
        <button 
          onClick={() => window.print()}
          className="flex-1 bg-primary text-background-dark font-bold py-4 rounded-xl flex items-center justify-center gap-2"
        >
          <Printer size={20} />
          Print Receipt
        </button>
      </div>
    </div>
  );
}

function PrinterConfig({ navigateTo }: { navigateTo: (s: Screen) => void }) {
  return (
    <div className="flex-1 flex flex-col">
      <header className="flex items-center p-4 border-b border-primary/10 bg-background-dark sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigateTo('dashboard')} className="p-2 hover:bg-primary/10 rounded-full transition-colors">
            <ArrowLeft className="text-slate-100" size={24} />
          </button>
          <Logo />
        </div>
        <h2 className="text-lg font-bold flex-1 text-center pr-20">Printer Config</h2>
        <Bitcoin className="text-primary" size={24} />
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-6">
        <section>
          <h3 className="text-primary text-sm font-bold uppercase tracking-wider mb-3">Device Status</h3>
          <div className="flex items-center gap-4 bg-primary/10 border border-primary/20 rounded-xl p-4 justify-between">
            <div className="flex items-center gap-4">
              <div className="text-primary flex items-center justify-center rounded-lg bg-primary/20 size-12">
                <Printer size={24} />
              </div>
              <div>
                <p className="text-base font-bold">Sunmi V2S Terminal</p>
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <p className="text-primary text-sm font-medium">Connected & Ready</p>
                </div>
              </div>
            </div>
            <CheckCircle className="text-primary" size={24} />
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-primary text-sm font-bold uppercase tracking-wider">Print Settings</h3>
          
          <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
            <div className="flex justify-between items-center mb-4">
              <label className="text-sm font-semibold">Thermal Density</label>
              <span className="text-xs font-mono bg-primary text-background-dark px-2 py-0.5 rounded font-bold">85%</span>
            </div>
            <input 
              type="range" 
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-primary"
              defaultValue={85}
            />
            <div className="flex justify-between mt-2 text-[10px] text-slate-500 uppercase font-bold">
              <span>Light</span>
              <span>Standard</span>
              <span>High</span>
            </div>
          </div>

          <div className="bg-primary/5 rounded-xl p-4 border border-primary/10 flex items-center justify-between">
            <div>
              <label className="text-sm font-semibold block">Paper Width</label>
              <span className="text-xs text-slate-500">Confirmed Sunmi V2S standard (57mm)</span>
            </div>
            <select className="bg-background-dark border-primary/20 rounded-lg text-sm focus:ring-primary focus:border-primary py-1 px-3">
              <option>57mm (Active)</option>
              <option>80mm (Ext)</option>
            </select>
          </div>

          <div className="bg-primary/5 rounded-xl p-4 border border-primary/10 flex items-center justify-between">
            <div>
              <label className="text-sm font-semibold block">Auto-Print Vouchers</label>
              <span className="text-xs text-slate-500">Print immediately after purchase</span>
            </div>
            <div className="w-12 h-6 bg-primary rounded-full relative cursor-pointer">
              <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-primary text-sm font-bold uppercase tracking-wider">Maintenance</h3>
          <div className="grid grid-cols-2 gap-3">
            <button className="flex flex-col items-center justify-center gap-2 p-4 bg-primary text-background-dark rounded-xl font-bold shadow-lg shadow-primary/20 active:scale-95 transition-transform">
              <History size={24} />
              <span className="text-xs uppercase">Test Print</span>
            </button>
            <button className="flex flex-col items-center justify-center gap-2 p-4 bg-primary/20 border border-primary/30 text-primary rounded-xl font-bold active:scale-95 transition-transform">
              <Eraser size={24} />
              <span className="text-xs uppercase">Head Cleaning</span>
            </button>
          </div>
          <div className="p-4 rounded-xl border border-dashed border-primary/30 flex items-center gap-3">
            <Info className="text-primary/60" size={20} />
            <p className="text-[11px] leading-tight text-slate-500">
              Last head cleaning performed 2 days ago. Recommended cleaning every 500 prints for optimal voucher legibility.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

function SettingsPage({ 
  navigateTo, 
  walletApi, 
  setWalletApi, 
  walletId, 
  setWalletId,
  currencyCode,
  setCurrencyCode,
  isServerConfigured
}: { 
  navigateTo: (s: Screen) => void, 
  walletApi: string, 
  setWalletApi: (v: string) => void,
  walletId: string,
  setWalletId: (v: string) => void,
  currencyCode: CurrencyCode,
  setCurrencyCode: (v: CurrencyCode) => void,
  isServerConfigured: boolean
}) {
  const [showManual, setShowManual] = useState(false);

  return (
    <div className="flex-1 flex flex-col">
      <header className="flex items-center p-4 border-b border-primary/10 bg-background-dark sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigateTo('dashboard')} className="p-2 hover:bg-primary/10 rounded-full transition-colors">
            <ArrowLeft className="text-slate-100" size={24} />
          </button>
          <Logo />
        </div>
        <h2 className="text-lg font-bold flex-1 text-center pr-20">Settings</h2>
        <Settings className="text-primary" size={24} />
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-8">
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <Wallet className="text-primary" size={20} />
            <h3 className="text-primary text-sm font-bold uppercase tracking-wider">Wallet Configuration</h3>
          </div>
          
          <div className="bg-primary/5 rounded-xl p-6 border border-primary/10 space-y-6">
            {isServerConfigured && !showManual ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3">
                  <CheckCircle className="text-emerald-500" size={24} />
                  <div>
                    <p className="text-emerald-500 font-bold text-sm">Connected to Blink</p>
                    <p className="text-xs text-slate-400">Credentials loaded from server secrets.</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowManual(true)}
                  className="text-primary text-xs font-bold uppercase tracking-wider hover:underline"
                >
                  Use manual configuration instead?
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {!isServerConfigured && (
                  <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <X className="text-rose-500" size={24} />
                      <div>
                        <p className="text-rose-500 font-bold text-sm">Not Connected</p>
                        <p className="text-xs text-slate-400">Server secrets not detected. Please check your Settings menu.</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => window.location.reload()}
                      className="w-full py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-500 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors"
                    >
                      Refresh App
                    </button>
                  </div>
                )}
                
                {isServerConfigured && showManual && (
                  <button 
                    onClick={() => setShowManual(false)}
                    className="text-primary text-xs font-bold uppercase tracking-wider hover:underline mb-2"
                  >
                    ← Back to Server Config
                  </button>
                )}

                <p className="text-xs text-slate-500 leading-relaxed">
                  Configure your Lightning wallet connection by providing your API endpoint and unique Wallet ID. This allows Sats Vouchers to securely source SATs for voucher generation.
                </p>
                
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-primary/60">Wallet API Endpoint</label>
                  <input 
                    type="text"
                    value={walletApi}
                    onChange={(e) => setWalletApi(e.target.value)}
                    className="w-full bg-background-dark border border-primary/20 rounded-xl p-4 text-sm font-mono focus:ring-primary focus:border-primary"
                    placeholder="https://api.yourwallet.com"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-primary/60">Wallet ID</label>
                  <input 
                    type="text"
                    value={walletId}
                    onChange={(e) => setWalletId(e.target.value)}
                    className="w-full bg-background-dark border border-primary/20 rounded-xl p-4 text-sm font-mono focus:ring-primary focus:border-primary"
                    placeholder="usr_..."
                  />
                </div>
              </div>
            )}
            
            <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-lg border border-primary/20">
              <Info className="text-primary shrink-0" size={16} />
              <p className="text-[10px] text-slate-400 leading-tight">
                {isServerConfigured && !showManual
                  ? "Server-side configuration is active. Local overrides are disabled."
                  : "Using local configuration. For better security, use environment variables."}
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <Bitcoin className="text-primary" size={20} />
            <h3 className="text-primary text-sm font-bold uppercase tracking-wider">Currency</h3>
          </div>
          
          <div className="bg-primary/5 rounded-xl p-6 border border-primary/10">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-primary/60">Display Currency</label>
              <div className="relative">
                <select 
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value as CurrencyCode)}
                  className="w-full bg-background-dark border border-primary/20 rounded-xl p-4 text-sm font-bold appearance-none focus:ring-primary focus:border-primary"
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-primary">
                  <ArrowRight size={16} className="rotate-90" />
                </div>
              </div>
              <p className="text-[10px] text-slate-500 mt-2">
                All USD values across the app will be converted to your selected currency using current market rates.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <Lock className="text-primary" size={20} />
            <h3 className="text-primary text-sm font-bold uppercase tracking-wider">Security</h3>
          </div>
          
          <div className="space-y-3">
            <button className="w-full flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/10 hover:bg-primary/10 transition-colors">
              <span className="text-sm font-medium">Change Admin PIN</span>
              <ArrowRight size={18} className="text-slate-500" />
            </button>
            <button className="w-full flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/10 hover:bg-primary/10 transition-colors">
              <span className="text-sm font-medium">Two-Factor Authentication</span>
              <div className="w-10 h-5 bg-slate-700 rounded-full relative">
                <div className="absolute left-1 top-1 w-3 h-3 bg-slate-500 rounded-full"></div>
              </div>
            </button>
          </div>
        </section>

        <div className="pt-8">
          <button 
            onClick={() => navigateTo('dashboard')}
            className="w-full bg-primary text-background-dark font-black py-4 rounded-xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-all"
          >
            SAVE SETTINGS
          </button>
        </div>
      </main>
    </div>
  );
}

function VouchersList({ navigateTo, vouchers, currencyCode }: { navigateTo: (s: Screen, v?: Voucher) => void, vouchers: Voucher[], currencyCode: CurrencyCode }) {
  const [searchQuery, setSearchQuery] = useState('');
  const currency = CURRENCIES.find(c => c.code === currencyCode) || CURRENCIES[0];

  const filteredVouchers = vouchers.filter(v => 
    v.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.amountBtc.toString().includes(searchQuery)
  );

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-10 bg-background-dark/80 backdrop-blur-md border-b border-primary/10">
        <div className="flex items-center p-4 gap-3">
          <button onClick={() => navigateTo('dashboard')} className="p-2 hover:bg-primary/10 rounded-full transition-colors">
            <ArrowLeft className="text-primary" size={24} />
          </button>
          <h2 className="text-xl font-bold tracking-tight">All Vouchers</h2>
        </div>
        <div className="px-4 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Search by ID or amount..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-primary/5 border border-primary/10 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-primary/30 transition-all"
            />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col divide-y divide-primary/10">
          {filteredVouchers.length > 0 ? (
            filteredVouchers.map((v) => (
              <div 
                key={v.id} 
                onClick={() => navigateTo('voucher-details', v)}
                className="flex items-center justify-between py-4 hover:bg-primary/5 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${
                    v.status === 'active' ? 'bg-emerald-500/20 text-emerald-500' : 
                    v.status === 'printed' ? 'bg-primary/20 text-primary' : 'bg-slate-500/20 text-slate-500'
                  }`}>
                    {v.status === 'active' ? <CheckCircle size={20} /> : v.status === 'printed' ? <Printer size={20} /> : <Lock size={20} />}
                  </div>
                  <div>
                    <p className="font-semibold">{v.amountBtc} BTC</p>
                    <p className="text-xs text-slate-400">{v.date} • ID: {v.id}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{currency.symbol}{(v.amountUsd * currency.rate).toFixed(2)}</p>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${
                    v.status === 'active' ? 'text-emerald-500' : 
                    v.status === 'printed' ? 'text-primary' : 'text-slate-500'
                  }`}>
                    {v.status}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <Search size={48} className="mb-4 opacity-20" />
              <p>No vouchers found matching "{searchQuery}"</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
