-- Create trigger function to automatically announce new paid donations
CREATE OR REPLACE FUNCTION public.after_donation_paid()
RETURNS TRIGGER AS $$
DECLARE
  donor_name TEXT;
  donor_amount NUMERIC;
  donor_note TEXT;
  announcement_title TEXT;
  announcement_content TEXT;
  should_insert BOOLEAN := false;
BEGIN
  -- Determine if donation has transitioned to paid
  IF (TG_OP = 'INSERT' AND NEW.is_paid = true) THEN
    should_insert := true;
  ELSIF (TG_OP = 'UPDATE' AND NEW.is_paid = true AND (OLD.is_paid IS NULL OR OLD.is_paid = false)) THEN
    should_insert := true;
  END IF;

  IF (should_insert) THEN
    donor_name := COALESCE(NULLIF(TRIM(NEW.name), ''), 'Anonymous / अनाम');
    donor_amount := NEW.amount;
    donor_note := COALESCE(NULLIF(TRIM(NEW.note), ''), 'Study support / शिक्षा सहायता');
    
    announcement_title := '💖 Thank You, ' || donor_name || '! / दिल से आभार!';
    
    announcement_content := '🎉 We have received a generous contribution of ₹' || donor_amount || ' from ' || donor_name || ' (' || donor_note || ') to promote young Indian student talent!' || 
      E'\n\nआप जैसे देवतुल्य लोगों का सहारा ही हमारे हौसलों को उड़ान देता है। पैसों की कमी सपनों को नहीं रोक सकती! NakshaBot को शिक्षा में मदद जारी रखने के लिए आप भी थोड़ा सा दिल बड़ा करके योगदान कर सकते हैं। 🚀';

    INSERT INTO public.announcements (title, content, is_active)
    VALUES (announcement_title, announcement_content, true);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger to the donations table
DROP TRIGGER IF EXISTS trg_after_donation_paid ON public.donations;
CREATE TRIGGER trg_after_donation_paid
AFTER INSERT OR UPDATE ON public.donations
FOR EACH ROW
EXECUTE FUNCTION public.after_donation_paid();
