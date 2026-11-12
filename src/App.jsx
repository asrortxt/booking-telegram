import { useEffect, useState } from 'react';
import Booking from './Booking.jsx';
import Admin from './Admin.jsx';

// Два экрана на хэш-роутинге: страница записи и админка. Серверные правила перенаправления не нужны.
export default function App() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash.startsWith('#/admin') ? <Admin /> : <Booking />;
}
