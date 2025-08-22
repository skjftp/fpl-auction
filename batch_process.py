import os
import pandas as pd
import shutil
import fitz  # PyMuPDF
from PIL import Image
import pytesseract
import re
from datetime import datetime

# IPL 2024 Schedule for matching
IPL_2024_SCHEDULE = {
    "LSG vs GT": "2024-04-07",
    "GT vs LSG": "2024-04-07",
    "LSG vs PBKS": "2024-03-30",
    "PBKS vs LSG": "2024-03-30",
    "KKR vs SRH": "2024-03-23",
    "SRH vs KKR": "2024-03-23",
}

def extract_text_from_pdf(pdf_path):
    """Extract text from PDF using PyMuPDF"""
    try:
        doc = fitz.open(pdf_path)
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
        return text
    except:
        return ""

def extract_text_from_image(image_path):
    """Extract text from image using OCR"""
    try:
        image = Image.open(image_path)
        text = pytesseract.image_to_string(image)
        return text
    except:
        return ""

def extract_invoice_details(text, filename):
    """Extract invoice details from text"""
    details = {
        'Invoice Date': None,
        'Company': 'Unknown',
        'Event/Match': 'Unknown',
        'Stand Name': 'General',
        'Match Date': None,
        'Ticket Quantity': 'Not specified',
        'Ticket Price': 0,
        'Confidence Level': 'High'
    }
    
    # Extract company
    if 'BookMyShow' in text or 'BigTree' in text:
        details['Company'] = 'BookMyShow'
    elif 'Paytm' in text:
        details['Company'] = 'Paytm Insider'
    elif 'TicketGenie' in text:
        details['Company'] = 'TicketGenie'
    
    # Extract event/match
    if 'WINNER OF SEMI-FINAL' in text and '19 Nov 2023' in text:
        details['Event/Match'] = 'Cricket World Cup 2023 Final'
        details['Match Date'] = '2023-11-19'
    elif 'Lucknow Super Giants vs Gujarat Titans' in text:
        details['Event/Match'] = 'LSG vs GT'
        details['Match Date'] = '2024-04-07'
    elif 'Lucknow Super Giants vs Punjab Kings' in text:
        details['Event/Match'] = 'LSG vs PBKS'
        details['Match Date'] = '2024-03-30'
    elif 'Cricket World Cup' in text or 'CWC' in text:
        details['Event/Match'] = 'Cricket World Cup 2023 Match'
    
    # Check if it's a convenience fee invoice
    if 'fee' in filename.lower() or 'Convenience Fee' in text:
        if details['Event/Match'] != 'Unknown':
            details['Event/Match'] += ' (Convenience Fee)'
        else:
            details['Event/Match'] = 'Convenience Fee'
        details['Stand Name'] = 'N/A'
    
    # Extract stand information
    stand_match = re.search(r'(BLOCK [A-Z] BAY \d+-[A-Z]+|BKT Tires Lower Block \d+|Knights Pav Corp)', text)
    if stand_match:
        details['Stand Name'] = stand_match.group(0)
    
    # Extract invoice date
    date_match = re.search(r'Date of issue[:\s]+([^,\n]+)', text)
    if date_match:
        try:
            date_str = date_match.group(1).strip()
            parsed_date = datetime.strptime(date_str, '%a, %d %b %Y')
            details['Invoice Date'] = parsed_date.strftime('%Y-%m-%d')
        except:
            pass
    
    # Extract quantity
    qty_match = re.search(r'Quantity[:\s]+(\d+)', text) or re.search(r'(\d+) tickets?', text)
    if qty_match:
        details['Ticket Quantity'] = qty_match.group(1)
    
    # Extract price
    price_match = re.search(r'Payment Amount: ₹([0-9,]+\.?\d*)', text) or re.search(r'Amount Paid[:\s]+₹([0-9,]+\.?\d*)', text)
    if price_match:
        details['Ticket Price'] = float(price_match.group(1).replace(',', ''))
    
    return details

# Find next 10 unprocessed files
base_path = '/Users/sumitjha/Dropbox/Mac/Documents/Projects/fpl-auction/Invoices'
processed_path = '/Users/sumitjha/Dropbox/Mac/Documents/Projects/fpl-auction/Invoices/processed'
csv_path = '/Users/sumitjha/Dropbox/Mac/Documents/Projects/fpl-auction/IPL_Event_Invoices_Complete.csv'

# Read existing CSV to check processed files
df = pd.read_csv(csv_path)
processed_files = set(df['File Name'].tolist())

# Find unprocessed files
unprocessed_files = []
for root, dirs, files in os.walk(base_path):
    if 'processed' in root:
        continue
    for file in files:
        if file.lower().endswith(('.pdf', '.png', '.jpg', '.jpeg')):
            if file not in processed_files:
                unprocessed_files.append((os.path.join(root, file), file))
                if len(unprocessed_files) >= 10:
                    break
    if len(unprocessed_files) >= 10:
        break

print(f"Processing {len(unprocessed_files)} files...\n")

# Process each file
new_rows = []
for file_path, filename in unprocessed_files:
    print(f"Processing: {filename}")
    
    # Extract text based on file type
    if filename.lower().endswith('.pdf'):
        text = extract_text_from_pdf(file_path)
    else:
        text = extract_text_from_image(file_path)
    
    if text:
        details = extract_invoice_details(text, filename)
        
        # Determine month from path
        month = 'Unknown'
        if 'Mar_24' in file_path:
            month = 'March'
        elif 'Apr_24' in file_path:
            month = 'April'
        elif 'May_24' in file_path:
            month = 'May'
        elif 'Jun_24' in file_path:
            month = 'June'
        
        # Create row
        new_row = {
            'File Name': filename,
            'Month': month,
            'Invoice Date': details['Invoice Date'],
            'Company': details['Company'],
            'Event/Match': details['Event/Match'],
            'Stand Name': details['Stand Name'],
            'Match Date': details['Match Date'],
            'Ticket Quantity': details['Ticket Quantity'],
            'Ticket Price': details['Ticket Price'],
            'Confidence Level': details['Confidence Level'],
            'File Path': file_path.replace('/Users/sumitjha/Dropbox/Mac/Documents/Projects/fpl-auction', '')
        }
        new_rows.append(new_row)
        
        # Move file to processed folder
        dest = os.path.join(processed_path, filename)
        try:
            shutil.move(file_path, dest)
            print(f"  ✓ Extracted and moved to processed")
        except Exception as e:
            print(f"  ✗ Error moving file: {e}")
    else:
        print(f"  ✗ Could not extract text")

# Add new rows to dataframe
if new_rows:
    new_df = pd.DataFrame(new_rows)
    df = pd.concat([df, new_df], ignore_index=True)
    
    # Save updated CSV
    df.to_csv(csv_path, index=False)
    print(f"\nAdded {len(new_rows)} invoices to CSV")

print(f"Total invoices in CSV: {len(df)}")