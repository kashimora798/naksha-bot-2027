-- Add dimensions and compression metadata to image_generations
ALTER TABLE public.image_generations 
  ADD COLUMN IF NOT EXISTS width INT,
  ADD COLUMN IF NOT EXISTS height INT,
  ADD COLUMN IF NOT EXISTS file_size_bytes INT;
