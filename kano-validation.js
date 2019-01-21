window.Kano = window.Kano || {};

/**
 * @polymerBehavior
 */
export const Mixin = (superClass) => class extends superClass {
    constructor() {
        super();
    }
    connectedCallback() {
        super.connectedCallback();
    }
    static get properties() {
        return {
            /**
             * Keeps track of error messages under the following schema:
             * @type {Object}
             */
            errors: {
                type: Object,
                value: {}
            }
        };
    }
    validateUsername(username) {
        if (!username) {
            this.set('errors.username', "Username is required.");
            return false;
        }

        if (username.length < 3) {
            this.set('errors.username', "Must be at least 3 characters long.");
            return false;
        }

        if (!/^[a-zA-Z0-9_\-.]+$/.test(username)) {
            this.set('errors.username', "Only letters, numbers, dashes, underscores and dots are allowed.");
            return false;
        }

        this.set('errors.username', undefined);
        return true;
    }
    validatePassword(password) {
        if (!password) {
            this.set('errors.password', "Password cannot be empty.");
            return false;
        }
        
        password.trim();
        if (password.includes(' ')) {
            this.set('errors.password', "Password cannot contain spaces.");
            return false;
        }

        if (password.length < 6) {
            this.set('errors.password', "Password must be at least 6 characters long.");
            return false;
        }

        this.set('errors.password', undefined);
        return true;
    }
    validateEmail(email) {
        let emailRegex = /^[_a-z0-9-\+]+(\.[_a-z0-9-\+]+)*@[a-z0-9-]+(\.[a-z0-9-]+)*(\.[a-z]+)$/i;

        if (!emailRegex.test(email)) {
            this.set('errors.email', "Please enter a valid email address.");
            return false;
        }

        this.set('errors.email', undefined);
        return true;
    }
    /**
     * Set relevant error if the terms have not been agreed to.
     * @param {Boolean} terms
     * @returns {Boolean}
     */
    validateTerms(terms) {
        if (terms) {
            this.set('errors.terms', null);
        } else {
            this.set('errors.terms', 'Please agree to the terms and conditions');
        }
        return terms;
    }
};

/**
 * @polymerBehavior Kano.Validation.Behaviour
 */
export const Behaviour = {
    properties: {
        /**
         * Keeps track of error messages under the following schema:
         * @type {Object}
         */
        errors: {
            type: Object,
            value: {}
        }
    },
    validateUsername(username) {
        if (!username) {
            this.set('errors.username', "Username is required.");
            return false;
        }

        if (username.length < 3) {
            this.set('errors.username', "Must be at least 3 characters long.");
            return false;
        }

        if (!/^[a-zA-Z0-9_\-.]+$/.test(username)) {
            this.set('errors.username', "Only letters, numbers, dashes, underscores and dots are allowed.");
            return false;
        }

        this.set('errors.username', undefined);
        return true;
    },
    validatePassword(password) {
        if (!password) {
            this.set('errors.password', "Password cannot be empty.");
            return false;
        }
        password.trim();

        if (password.includes(' ')) {
            this.set('errors.password', "Password cannot contain spaces.");
            return false;
        }

        if (password.length < 6) {
            this.set('errors.password', "Password must be at least 6 characters long.");
            return false;
        }

        this.set('errors.password', undefined);
        return true;
    },
    validateEmail(email) {
        let emailRegex = /^[_a-z0-9-\+]+(\.[_a-z0-9-\+]+)*@[a-z0-9-]+(\.[a-z0-9-]+)*(\.[a-z]+)$/i;

        if (!emailRegex.test(email)) {
            this.set('errors.email', "Please enter a valid email address.");
            return false;
        }

        this.set('errors.email', undefined);
        return true;
    },
    /**
     * Set relevant error if the terms have not been agreed to.
     * @param {Boolean} terms
     * @returns {Boolean}
     */
    validateTerms(terms) {
        if (terms) {
            this.set('errors.terms', null);
        } else {
            this.set('errors.terms', 'Please agree to the terms and conditions');
        }
        return terms;
    }
};
