import pandas as pd
import fitz  # PyMuPDF
from PIL import Image
import pytesseract
import re
import os

def extract_text_from_file(file_path):
    """Extract text from PDF or image file"""
    text = ""
    if file_path.lower().endswith('.pdf'):
        try:
            doc = fitz.open(file_path)
            for page in doc:
                text += page.get_text()
            doc.close()
        except:
            pass
    elif file_path.lower().endswith(('.png', '.jpg', '.jpeg')):
        try:
            image = Image.open(file_path)
            text = pytesseract.image_to_string(image)
        except:
            pass
    return text

def extract_quantity(text, filename, amount=None):
    """Extract quantity from invoice text using multiple patterns"""
    
    # If it's a convenience/service fee, usually quantity is 1
    if 'fee' in filename.lower() or 'convenience fee' in text.lower() or 'service fee' in text.lower() or 'booking fee' in text.lower():
        return 1
    
    quantity = None
    
    # Pattern 1: Direct quantity mentions (X tickets, X Nos, etc.)
    patterns = [
        r'(\d+)\s+tickets?\b(?!\s+x)',
        r'Quantity[\s:]+(\d+)',
        r'\bQty[\s:]+(\d+)',
        r'(\d+)\s+Nos\b',
        r'(\d+)\s+nos\b',
        r'(\d+)\s+EA\b',
        r'(\d+)\s+OTH\b',
        r'Total Qty[\s:]+(\d+)',
        r'No\.?\s+of\s+tickets?[\s:]+(\d+)'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            quantity = int(match.group(1).replace(',', ''))
            break
    
    # Pattern 2: Sum up multiple ticket line items
    if not quantity:
        ticket_lines = re.findall(r'(?:Ticket|tickets?).*?(\d+)\s+(?:OTH|EA|NOS|nos)', text, re.IGNORECASE | re.DOTALL)
        if ticket_lines:
            try:
                total = sum(int(q.replace(',', '')) for q in ticket_lines)
                if total > 0:
                    quantity = total
            except:
                pass
    
    # Pattern 3: Extract from seat numbers (e.g., T-32 to T-41)
    if not quantity:
        seat_ranges = re.findall(r'([A-Z]+-?\d+|[A-Z]+\s*\d+)[\s,]+(?:to|thru|-)\s+([A-Z]+-?\d+|[A-Z]+\s*\d+)', text, re.IGNORECASE)
        if seat_ranges:
            total_seats = 0
            for start, end in seat_ranges:
                try:
                    start_num = int(re.search(r'\d+', start).group())
                    end_num = int(re.search(r'\d+', end).group())
                    total_seats += abs(end_num - start_num) + 1
                except:
                    pass
            if total_seats > 0:
                quantity = total_seats
    
    # Pattern 4: Count individual seat mentions (e.g., EEE-5 EEE-6)
    if not quantity:
        individual_seats = re.findall(r'[A-Z]{1,3}-?\d+(?:\s+[A-Z]{1,3}-?\d+)*', text)
        if individual_seats:
            seat_count = 0
            for seat_group in individual_seats[:5]:  # Check first 5 matches
                seats = re.findall(r'[A-Z]{1,3}-?\d+', seat_group)
                if 1 <= len(seats) <= 20:  # Reasonable seat count
                    seat_count = max(seat_count, len(seats))
            if seat_count > 0:
                quantity = seat_count
    
    # Pattern 5: For BCCI/large invoices, try to estimate from amount
    if not quantity and amount and amount > 100000:
        # Check if it's a bulk ticket purchase
        if 'IPL' in text and 'Final' in text:
            # Finals tickets are expensive, estimate quantity
            avg_ticket_price = amount / 50  # Rough estimate
            if 10000 < avg_ticket_price < 100000:
                quantity = round(amount / avg_ticket_price)
    
    # Pattern 6: Extract quantity from specific formats
    if not quantity:
        # Look for patterns like "10 tickets: BKT Tires"
        match = re.search(r'(\d+)\s+tickets?:', text, re.IGNORECASE)
        if match:
            quantity = int(match.group(1))
    
    # Pattern 7: Table quantity column
    if not quantity:
        # Look for quantity in table format
        match = re.search(r'(?:Qty|Quantity|No\.|Nos)\s*\n\s*(\d+)', text, re.IGNORECASE)
        if match:
            quantity = int(match.group(1))
    
    return quantity

# Read CSV
csv_path = '/Users/sumitjha/Dropbox/Mac/Documents/Projects/fpl-auction/IPL_Event_Invoices_Complete.csv'
df = pd.read_csv(csv_path)

# Find files with unspecified quantities
unspecified = df[(df['Ticket Quantity'] == 'Not specified') | (df['Ticket Quantity'] == 'Various')].copy()

print(f'Found {len(unspecified)} files with unspecified quantities')
print('\nProcessing files to extract quantities:\n')

updates = []
for idx in unspecified.index:
    row = df.loc[idx]
    filename = row['File Name']
    file_path = '/Users/sumitjha/Dropbox/Mac/Documents/Projects/fpl-auction/Invoices/processed/' + filename
    
    if not os.path.exists(file_path):
        print(f'File not found: {filename}')
        continue
    
    try:
        text = extract_text_from_file(file_path)
        amount = row['Ticket Price'] if pd.notna(row['Ticket Price']) else None
        quantity = extract_quantity(text, filename, amount)
        
        if quantity:
            print(f'{filename}: Quantity = {quantity}')
            updates.append({'index': idx, 'quantity': quantity})
        else:
            print(f'{filename}: Could not extract quantity')
            
    except Exception as e:
        print(f'Error processing {filename}: {str(e)}')

print(f'\n\nSummary: Found quantities for {len(updates)} out of {len(unspecified)} files')

# Update the CSV
if updates:
    print('\nUpdating CSV with extracted quantities...')
    for update in updates:
        df.at[update['index'], 'Ticket Quantity'] = update['quantity']
    
    # Save updated CSV
    df.to_csv(csv_path, index=False)
    print(f'CSV updated successfully with {len(updates)} quantity values')