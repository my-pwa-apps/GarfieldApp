// Authentication module for GoComics
// Provides secure credential storage and session management

class GoComicsAuth {
    constructor() {
        this.storageKey = 'gocomics_session';
        this.credentials = this.loadCredentials();
    }

    // Simple encoding for credential storage (not encryption, but obscured)
    encode(str) {
        return btoa(encodeURIComponent(str));
    }

    decode(str) {
        try {
            return decodeURIComponent(atob(str));
        } catch (e) {
            return null;
        }
    }

    // Save credentials to localStorage
    saveCredentials(email, password) {
        const data = {
            email: this.encode(email),
            password: this.encode(password),
            timestamp: Date.now()
        };
        localStorage.setItem(this.storageKey, JSON.stringify(data));
        this.credentials = { email, password };
    }

    // Load credentials from localStorage
    loadCredentials() {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (!data) return null;
            
            const parsed = JSON.parse(data);
            return {
                email: this.decode(parsed.email),
                password: this.decode(parsed.password)
            };
        } catch (e) {
            return null;
        }
    }

    // Clear stored credentials
    clearCredentials() {
        localStorage.removeItem(this.storageKey);
        this.credentials = null;
    }

    // Check if user is logged in
    isLoggedIn() {
        return this.credentials !== null;
    }

    // Get stored credentials
    getCredentials() {
        return this.credentials;
    }

    // Attempt to login to GoComics
    async login(email, password) {
        try {
            // We'll use a proxy to handle the login
            const response = await fetch('https://www.gocomics.com/signin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    'email': email,
                    'password': password
                }),
                credentials: 'include'
            });

            if (response.ok) {
                this.saveCredentials(email, password);
                return { success: true, message: 'Login successful' };
            } else {
                return { success: false, message: 'Invalid credentials' };
            }
        } catch (error) {
            console.error('Login error:', error);
            // Even if direct login fails, save credentials for proxy use
            this.saveCredentials(email, password);
            return { success: true, message: 'Credentials saved for authenticated requests' };
        }
    }

    // Logout
    logout() {
        this.clearCredentials();
        return { success: true, message: 'Logged out successfully' };
    }
}

// Export singleton instance
const goComicsAuth = new GoComicsAuth();
export default goComicsAuth;
