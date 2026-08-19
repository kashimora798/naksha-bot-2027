export interface PendingDonation {
  id: string;
  amount: number;
  note?: string;
  donorName?: string;
  initiatedAt: number;
  paymentSessionId?: string;
}

const STORAGE_KEY = 'nakshabot_pending_donation';

export function savePendingDonation(donation: Omit<PendingDonation, 'initiatedAt'> & { initiatedAt?: number }) {
  try {
    const data: PendingDonation = {
      ...donation,
      initiatedAt: donation.initiatedAt || Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save pending donation to localStorage', e);
  }
}

export function getPendingDonation(): PendingDonation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse pending donation from localStorage', e);
    return null;
  }
}

export function clearPendingDonation() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to remove pending donation from localStorage', e);
  }
}

export function isPendingDonationVisible(): boolean {
  return Boolean(getPendingDonation());
}

