import React from 'react';

export default function ContactScreen() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 overflow-x-hidden selection:bg-orange-200 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white p-8 sm:p-12 shadow-xl rounded-2xl ring-1 ring-slate-200">
        <h1 className="text-4xl font-bold font-public-sans text-slate-900 mb-8 pb-4 border-b border-slate-100">Contact Us</h1>
        
        <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed">
          <p className="text-lg mb-8">
            We are here to help! If you have any questions, concerns, or need assistance with NakshaBot, please reach out to us using the contact details below.
          </p>
          
          <div className="bg-orange-50 border border-orange-100 rounded-xl p-8 mb-8">
            <h2 className="text-2xl font-bold text-slate-800 mb-6 font-public-sans">Support Email</h2>
            <p className="flex items-center gap-3 text-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <a href="mailto:seller+7bcd87740ed34d0aac17b7e0e770c575@instamojo.com" className="text-orange-600 hover:text-orange-700 font-medium">
                seller+7bcd87740ed34d0aac17b7e0e770c575@instamojo.com
              </a>
            </p>
          </div>
          
          <p className="text-slate-500 text-sm">
            Please allow up to 24-48 hours for our support team to review your inquiry and get back to you. When contacting us regarding a transaction or map export issue, please include your registered email address and project details.
          </p>
        </div>
        
        <div className="mt-12 text-center">
          <a href="/" className="inline-flex items-center text-orange-600 hover:text-orange-700 font-semibold font-[Noto_Sans] transition-colors">
            &larr; Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}
