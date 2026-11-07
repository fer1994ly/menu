import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App shell', () => {
  it('renders the Privee Food title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Privee Food' })).toBeInTheDocument();
  });
});
