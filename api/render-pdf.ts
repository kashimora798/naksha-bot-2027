export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.status(410).json({
    error: 'Server-side rendering has been replaced. Please reload the page to use the new client-side export.',
    code: 'DEPRECATED',
  });
}

