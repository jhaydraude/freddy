'use client';
import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';

export default function ApiDocsPage() {
    return (
        <ApiReferenceReact
            configuration={{
                url: '/api/openapi.json',
                theme: 'purple',
                showSidebar: true,
                hideDownloadButton: false,
                forceDarkModeState: 'dark',
            }}
        />
    );
}
