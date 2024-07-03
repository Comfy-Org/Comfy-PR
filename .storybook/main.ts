import { StorybookConfig } from '@storybook/react-vite';
 
const config: StorybookConfig = {
  // ...
  // framework: '@storybook/react-webpack5', 👈 Remove this
  framework: '@storybook/react-vite', // 👈 Add this
};
 
export default config;