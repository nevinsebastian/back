import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [userRole, setUserRole] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed. Please try again.');
      }

      if (!data.token) {
        throw new Error('No token received from server');
      }

      // Save token to localStorage
      localStorage.setItem('token', data.token);

      // Decode role from token
      const decodedToken = JSON.parse(atob(data.token.split('.')[1]));
      const role = decodedToken.role;

      // Store user data in localStorage
      localStorage.setItem('user', JSON.stringify({
        id: decodedToken.id,
        email: decodedToken.email,
        role: decodedToken.role
      }));

      // Set role in parent component
      setUserRole(role);

      // Navigate based on role
      navigateToRole(role);
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      {/* Render your form here */}
    </div>
  );
};

export default Login; 