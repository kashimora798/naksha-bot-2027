import React from 'react';
import { useParams, Navigate } from 'react-router-dom';
import SeoArticleLayout from '../components/SeoArticleLayout';
import { seoArticles } from '../data/seoContent';

export default function SeoArticlePage({ articleId }: { articleId: string }) {
  // Find the article based on the ID
  const article = seoArticles.find(a => a.id === articleId);
  
  if (!article) {
    return <Navigate to="/" replace />;
  }

  return (
    <SeoArticleLayout
      title={article.title}
      metaDescription={article.metaDescription}
      h1={article.h1}
      schema={article.schema}
    >
      <div 
        dangerouslySetInnerHTML={{ __html: article.content }} 
        className="seo-content-container"
      />
    </SeoArticleLayout>
  );
}
