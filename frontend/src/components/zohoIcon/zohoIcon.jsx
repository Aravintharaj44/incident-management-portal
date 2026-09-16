import React from 'react';
import Icon from '@ant-design/icons';

// Paste your Zoho SVG paths inside this functional component
const ZohoSvg = () => (
  <svg width="1em" height="1em" fill="currentColor" viewBox="0 0 24 24">
    {/* Example path representing the red, blue, green, yellow square/puzzle layout of Zoho */}
    <path d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z"/>
  </svg>
);

// Pass the SVG component to Ant Design's Icon component
export const ZohoIcon = (props) => <Icon component={ZohoSvg} {...props} />;
