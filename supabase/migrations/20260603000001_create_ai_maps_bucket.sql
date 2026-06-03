-- Create the public storage bucket for AI maps
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ai-maps', 
  'ai-maps', 
  true, 
  52428800, -- 50MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE 
SET public = true;

-- Enable SELECT access for everyone to allow viewing generated maps
DROP POLICY IF EXISTS "Public Select Access" ON storage.objects;
CREATE POLICY "Public Select Access" ON storage.objects
  FOR SELECT USING (bucket_id = 'ai-maps');

-- Enable INSERT/UPDATE access for service role or authenticated users under their uid folder
DROP POLICY IF EXISTS "Auth Insert Access" ON storage.objects;
CREATE POLICY "Auth Insert Access" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'ai-maps'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
