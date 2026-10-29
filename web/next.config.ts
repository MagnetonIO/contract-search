import {withWorkflow} from 'workflow/next';
import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['playwright-core'],
  outputFileTracingIncludes: { '/*': ['./node_modules/playwright-core/browsers.json','./node_modules/playwright-core/package.json','./node_modules/playwright-core/lib/**'] },
  outputFileTracingExcludes: { '/*': ['./.local/**', './tests/**'] },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    ] }];
  },
};
export default withWorkflow(config);
