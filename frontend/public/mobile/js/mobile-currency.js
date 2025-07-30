// Currency formatting utility for mobile
function formatCurrency(amount, includeM = true) {
    const jSymbol = '<span class="currency-j">J</span>';
    if (includeM) {
        return `${jSymbol}${amount}m`;
    } else {
        return `${jSymbol}${amount}`;
    }
}

// For use in places where HTML is not supported (like alerts/confirms)
function formatCurrencyPlain(amount, includeM = true) {
    if (includeM) {
        return `J${amount}m`;
    } else {
        return `J${amount}`;
    }
}

// Export for use in other modules
window.formatCurrency = formatCurrency;
window.formatCurrencyPlain = formatCurrencyPlain;