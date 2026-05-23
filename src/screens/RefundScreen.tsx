import React from 'react';

export default function RefundScreen() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 overflow-x-hidden selection:bg-orange-200 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white p-8 sm:p-12 shadow-xl rounded-2xl ring-1 ring-slate-200">
        <h1 className="text-4xl font-bold font-[Baloo_2] text-slate-900 mb-8 pb-4 border-b border-slate-100">Refund and Cancellation Policy</h1>
        
        <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed space-y-6">
          <p>
            Upon completing a Transaction, you are entering into a legally binding and enforceable agreement with us to purchase the product and/or service.
          </p>
          <p>
            After this point the User may cancel the Transaction unless it has been specifically provided for on the Platform. In which case, the cancellation will be subject to the terms mentioned on the Platform. We shall retain the discretion in approving any cancellation requests and we may ask for additional details before approving any requests.
          </p>
          <p>
            Once you have received the product and/or service, the only event where you can request for a replacement or a return and a refund is if the product and/or service does not match the description as mentioned on the Platform.
          </p>
          <p>
            Any request for refund must be submitted within three days from the date of the Transaction or such number of days prescribed on the Platform, which shall in no event be less than three days.
          </p>
          <p>
            A User may submit a claim for a refund for a purchase made, by raising a ticket here or contacting us on <a href="mailto:seller+7bcd87740ed34d0aac17b7e0e770c575@instamojo.com" className="text-orange-600 hover:text-orange-700 font-medium">seller+7bcd87740ed34d0aac17b7e0e770c575@instamojo.com</a> and providing a clear and specific reason for the refund request, including the exact terms that have been violated, along with any proof, if required.
          </p>
          <p>
            Whether a refund will be provided will be determined by us, and we may ask for additional details before approving any requests.
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
