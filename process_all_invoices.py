#!/usr/bin/env python3
"""
Process all IPL and event invoices from multiple folders
Creates comprehensive Excel report with all requested details
"""

import os
import pandas as pd
from datetime import datetime

# IPL 2024 Complete Match Schedule
IPL_2024_MATCHES = {
    # March 2024
    "CSK vs RCB": "2024-03-22",
    "RCB vs CSK": "2024-03-22",
    "PBKS vs DC": "2024-03-23",
    "DC vs PBKS": "2024-03-23",
    "KKR vs SRH": "2024-03-23",
    "SRH vs KKR": "2024-03-23",
    "RR vs LSG": "2024-03-24",
    "LSG vs RR": "2024-03-24",
    "GT vs MI": "2024-03-24",
    "MI vs GT": "2024-03-24",
    "RCB vs PBKS": "2024-03-25",
    "PBKS vs RCB": "2024-03-25",
    "CSK vs GT": "2024-03-26",
    "GT vs CSK": "2024-03-26",
    "DC vs MI": "2024-03-27",
    "MI vs DC": "2024-03-27",
    "KKR vs DC": "2024-03-29",
    "DC vs KKR": "2024-03-29",
    "RR vs RCB": "2024-03-30",
    "RCB vs RR": "2024-03-30",
    "LSG vs PBKS": "2024-03-30",
    "PBKS vs LSG": "2024-03-30",
    "GT vs SRH": "2024-03-31",
    "SRH vs GT": "2024-03-31",
    
    # April 2024
    "MI vs RR": "2024-04-01",
    "RR vs MI": "2024-04-01",
    "RCB vs LSG": "2024-04-02",
    "LSG vs RCB": "2024-04-02",
    "DC vs CSK": "2024-04-03",
    "CSK vs DC": "2024-04-03",
    "GT vs PBKS": "2024-04-04",
    "PBKS vs GT": "2024-04-04",
    "SRH vs MI": "2024-04-05",
    "MI vs SRH": "2024-04-05",
    "RR vs KKR": "2024-04-06",
    "KKR vs RR": "2024-04-06",
    "CSK vs SRH": "2024-04-07",
    "SRH vs CSK": "2024-04-07",
    "RR vs GT": "2024-04-08",
    "GT vs RR": "2024-04-08",
    "RCB vs MI": "2024-04-11",
    "MI vs RCB": "2024-04-11",
    "DC vs LSG": "2024-04-12",
    "LSG vs DC": "2024-04-12",
    "PBKS vs GT": "2024-04-13",
    "GT vs PBKS": "2024-04-13",
    "CSK vs PBKS": "2024-04-14",
    "PBKS vs CSK": "2024-04-14",
    "KKR vs LSG": "2024-04-14",
    "LSG vs KKR": "2024-04-14",
    "SRH vs RR": "2024-04-15",
    "RR vs SRH": "2024-04-15",
    "MI vs DC": "2024-04-16",
    "DC vs MI": "2024-04-16",
    "PBKS vs SRH": "2024-04-17",
    "SRH vs PBKS": "2024-04-17",
    "RCB vs GT": "2024-04-18",
    "GT vs RCB": "2024-04-18",
    "PBKS vs MI": "2024-04-25",
    "MI vs PBKS": "2024-04-25",
    "KKR vs RCB": "2024-04-21",
    "RCB vs KKR": "2024-04-21",
    "DC vs GT": "2024-04-24",
    "GT vs DC": "2024-04-24",
    "CSK vs LSG": "2024-04-23",
    "LSG vs CSK": "2024-04-23",
    "MI vs KKR": "2024-04-26",
    "KKR vs MI": "2024-04-26",
    "RCB vs DC": "2024-04-27",
    "DC vs RCB": "2024-04-27",
    "CSK vs SRH": "2024-04-28",
    "SRH vs CSK": "2024-04-28",
    "KKR vs PBKS": "2024-04-28",
    "PBKS vs KKR": "2024-04-28",
    "LSG vs RR": "2024-04-27",
    "RR vs LSG": "2024-04-27",
    "GT vs RCB": "2024-04-28",
    "RCB vs GT": "2024-04-28",
    
    # May 2024
    "MI vs LSG": "2024-05-03",
    "LSG vs MI": "2024-05-03",
    "CSK vs PBKS": "2024-05-05",
    "PBKS vs CSK": "2024-05-05",
    "RCB vs RR": "2024-05-04",
    "RR vs RCB": "2024-05-04",
    "DC vs RR": "2024-05-07",
    "RR vs DC": "2024-05-07",
    "SRH vs LSG": "2024-05-08",
    "LSG vs SRH": "2024-05-08",
    "PBKS vs RCB": "2024-05-09",
    "RCB vs PBKS": "2024-05-09",
    "CSK vs RR": "2024-05-12",
    "RR vs CSK": "2024-05-12",
    "GT vs KKR": "2024-05-13",
    "KKR vs GT": "2024-05-13",
    "DC vs LSG": "2024-05-14",
    "LSG vs DC": "2024-05-14",
    "PBKS vs RR": "2024-05-15",
    "RR vs PBKS": "2024-05-15",
    "MI vs SRH": "2024-05-17",
    "SRH vs MI": "2024-05-17",
    "RCB vs CSK": "2024-05-18",
    "CSK vs RCB": "2024-05-18",
    "RR vs KKR": "2024-05-19",
    "KKR vs RR": "2024-05-19",
    
    # Playoffs
    "Qualifier 1": "2024-05-21",
    "Eliminator": "2024-05-22",
    "Qualifier 2": "2024-05-24",
    "Final": "2024-05-26"
}

def get_company_from_filename(filename):
    """Determine company based on filename patterns"""
    filename_lower = filename.lower()
    
    if "bms" in filename_lower or "bookmyshow" in filename_lower:
        return "BookMyShow"
    elif "waste" in filename_lower or "insider" in filename_lower or "paytm" in filename_lower:
        return "Paytm Insider"
    elif "ticket" in filename_lower or "ticketgenie" in filename_lower:
        return "TicketGenie"
    elif "jsw" in filename_lower:
        return "JSW GMR"
    elif "big" in filename_lower and "tree" not in filename_lower:
        return "Big Tree/BookMyShow"
    elif "kph" in filename_lower:
        return "KPH Dream Sports"
    elif "omio" in filename_lower:
        return "Omio"
    elif "ticombo" in filename_lower:
        return "Ticombo"
    elif "chelsea" in filename_lower:
        return "Chelsea FC"
    elif "football" in filename_lower:
        return "Football Platform"
    elif "walk" in filename_lower:
        return "Walk-in/Box Office"
    else:
        return "Unknown"

def extract_price_from_filename(filename):
    """Extract price from filename if present"""
    import re
    # Look for patterns like _12345.67 or _12345_
    price_patterns = [
        r'_(\d+(?:\.\d+)?)[_\.](?:pdf|png|jpeg|jpg)',
        r'_(\d+)(?:_fee)?\.', 
        r'_(\d+)$'
    ]
    
    for pattern in price_patterns:
        match = re.search(pattern, filename.lower())
        if match:
            try:
                return float(match.group(1))
            except:
                continue
    return 0

def extract_date_from_filename(filename):
    """Extract date from filename"""
    import re
    # Pattern like 31.03_ or 31.3_
    date_pattern = r'(\d{1,2})\.(\d{1,2})(?:_|\.)'
    match = re.search(date_pattern, filename)
    if match:
        day, month = match.groups()
        year = "2024"
        return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
    return ""

def get_month_name(filepath):
    """Get month name from folder path"""
    if "Mar_24" in filepath:
        return "March"
    elif "Apr_24" in filepath:
        return "April"
    elif "May_24" in filepath:
        return "May"
    elif "Jun_24" in filepath:
        return "June"
    return "Unknown"

def determine_event_type(filename, filepath):
    """Determine if it's IPL or other event based on context"""
    filename_lower = filename.lower()
    
    # Non-IPL events
    if "chelsea" in filename_lower:
        return "Chelsea FC Match"
    elif "football" in filename_lower:
        return "Football Match"
    elif "walk" in filename_lower:
        return "Event Walk-in"
    elif "omio" in filename_lower:
        return "Travel/Event via Omio"
    elif "ticombo" in filename_lower:
        return "Event via Ticombo"
    
    # Check for IPL indicators
    ipl_teams = ["csk", "mi", "rcb", "dc", "gt", "kkr", "lsg", "pbks", "rr", "srh"]
    for team in ipl_teams:
        if team in filename_lower:
            return "IPL 2024"
    
    # Check for playoff indicators
    if "qualifier" in filename_lower or "eliminator" in filename_lower or "final" in filename_lower:
        return "IPL 2024 Playoffs"
    
    # Default to IPL if in certain folders
    if any(month in filepath for month in ["Mar_24", "Apr_24", "May_24"]):
        return "IPL 2024"
    
    return "Unknown Event"

def process_invoice_file(filepath):
    """Process a single invoice file"""
    filename = os.path.basename(filepath)
    
    # Skip non-invoice files
    skip_patterns = ["schedule", ".eml", ".DS_Store", "confirmed"]
    if any(pattern in filename.lower() for pattern in skip_patterns):
        return None
    
    # Determine if it's a fee invoice
    is_fee_invoice = "fee" in filename.lower() or "_cf" in filename.lower()
    
    invoice_data = {
        "File Name": filename,
        "Month": get_month_name(filepath),
        "Invoice Date": extract_date_from_filename(filename),
        "Company": get_company_from_filename(filename),
        "Event Type": determine_event_type(filename, filepath),
        "Match/Event": "To be determined",  # Would need OCR/PDF reading
        "Stand Name": "General",  # Would need OCR/PDF reading
        "Match Date": "",
        "Ticket Quantity": 1,  # Default, would need OCR/PDF reading
        "Ticket Price": extract_price_from_filename(filename),
        "Is Convenience Fee": is_fee_invoice,
        "File Path": filepath
    }
    
    # Try to match with IPL schedule if it's IPL
    if "IPL" in invoice_data["Event Type"]:
        # This would need actual PDF/image reading to get match details
        # For now, using filename patterns
        for match_key in IPL_2024_MATCHES:
            teams = match_key.replace(" vs ", "_").lower()
            if any(team in filename.lower() for team in teams.split("_")):
                invoice_data["Match/Event"] = match_key
                invoice_data["Match Date"] = IPL_2024_MATCHES[match_key]
                break
    
    return invoice_data

# Process all files
base_path = "/Users/sumitjha/Dropbox/Mac/Documents/Projects/fpl-auction/Invoices"
all_invoices = []

for root, dirs, files in os.walk(base_path):
    for file in files:
        if file.endswith(('.pdf', '.png', '.jpeg', '.jpg', '.PDF')):
            filepath = os.path.join(root, file)
            invoice_data = process_invoice_file(filepath)
            if invoice_data:
                all_invoices.append(invoice_data)

# Create DataFrame
df = pd.DataFrame(all_invoices)

# Sort by month and date
month_order = {"March": 1, "April": 2, "May": 3, "June": 4, "Unknown": 5}
df["Month_Order"] = df["Month"].map(month_order)
df = df.sort_values(["Month_Order", "Invoice Date", "File Name"])
df = df.drop("Month_Order", axis=1)

# Calculate summary statistics
total_amount = df["Ticket Price"].sum()
total_ipl = df[df["Event Type"].str.contains("IPL", na=False)]["Ticket Price"].sum()
total_other = df[~df["Event Type"].str.contains("IPL", na=False)]["Ticket Price"].sum()

# Save to Excel with multiple sheets
output_file = "/Users/sumitjha/Dropbox/Mac/Documents/Projects/fpl-auction/Complete_Invoice_Summary.xlsx"
with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
    # Main sheet with all invoices
    df.to_excel(writer, sheet_name='All Invoices', index=False)
    
    # Summary sheet
    summary_df = pd.DataFrame({
        'Category': ['Total Invoices', 'IPL Invoices', 'Other Events', 'Total Amount', 'IPL Amount', 'Other Amount'],
        'Value': [len(df), 
                 len(df[df["Event Type"].str.contains("IPL", na=False)]),
                 len(df[~df["Event Type"].str.contains("IPL", na=False)]),
                 f"₹{total_amount:,.2f}",
                 f"₹{total_ipl:,.2f}",
                 f"₹{total_other:,.2f}"]
    })
    summary_df.to_excel(writer, sheet_name='Summary', index=False)
    
    # By company sheet
    company_summary = df.groupby('Company').agg({
        'File Name': 'count',
        'Ticket Price': 'sum'
    }).round(2)
    company_summary.columns = ['Number of Invoices', 'Total Amount']
    company_summary.to_excel(writer, sheet_name='By Company')
    
    # By month sheet
    month_summary = df.groupby('Month').agg({
        'File Name': 'count',
        'Ticket Price': 'sum'
    }).round(2)
    month_summary.columns = ['Number of Invoices', 'Total Amount']
    month_summary.to_excel(writer, sheet_name='By Month')

print(f"Excel file created: {output_file}")
print(f"Total invoices processed: {len(df)}")
print(f"\nSummary:")
print(f"- Total amount: ₹{total_amount:,.2f}")
print(f"- IPL events: ₹{total_ipl:,.2f}")
print(f"- Other events: ₹{total_other:,.2f}")
print(f"\nTop 5 invoices by amount:")
print(df.nlargest(5, 'Ticket Price')[['File Name', 'Company', 'Ticket Price']])