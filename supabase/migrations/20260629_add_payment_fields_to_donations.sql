-- Alter donations table to add payment tracking columns
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS payment_id TEXT;
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS payment_session_id TEXT;

-- Index for payment ID lookups
CREATE INDEX IF NOT EXISTS donations_payment_id_idx ON public.donations(payment_id);
