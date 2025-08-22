#!/usr/bin/env python3
"""
Process all IPL and event invoices with confidence scoring
Creates comprehensive Excel report with extraction confidence levels
"""

import os
import re
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
    "Qualifier 2": "2024-05-24",
    "Eliminator": "2024-05-22",
    "Final": "2024-05-26"
}

class InvoiceProcessor:
    def __init__(self):
        self.confidence_scores = {}
        
    def calculate_confidence(self, extracted_data):
        """Calculate confidence score for extracted data"""
        confidence = 100
        reasons = []
        
        # Check company identification
        if extracted_data['Company'] == 'Unknown':
            confidence -= 20
            reasons.append("Company unclear")
        
        # Check price extraction
        if extracted_data['Ticket Price'] == 0:
            confidence -= 25
            reasons.append("Price not found")
        elif extracted_data['Ticket Price'] > 1000000:  # Likely an invoice number
            confidence -= 15
            reasons.append("Price uncertain")
        
        # Check event/match identification
        if extracted_data['Match/Event'] == 'Unknown Event':
            confidence -= 20
            reasons.append("Event unclear")
        
        # Check date extraction
        if not extracted_data['Invoice Date']:
            confidence -= 15
            reasons.append("Date missing")
        
        # Check if it's a fee invoice
        if extracted_data['Is Convenience Fee']:
            confidence -= 5
            reasons.append("Fee invoice")
        
        # Bonus confidence for clear patterns
        if extracted_data['Company'] in ['BookMyShow', 'Paytm Insider', 'TicketGenie']:
            confidence += 5
        
        if extracted_data['Match Date']:
            confidence += 5
        
        confidence = max(0, min(100, confidence))
        
        return confidence, ', '.join(reasons) if reasons else 'High confidence'

    def get_company_from_filename(self, filename):
        """Determine company based on filename patterns"""
        filename_lower = filename.lower()
        
        company_patterns = {
            'BookMyShow': ['bms', 'bookmyshow', 'bigtree', 'big_tree'],
            'Paytm Insider': ['waste', 'wasteland', 'insider', 'paytm'],
            'TicketGenie': ['ticket', 'ticketgenie', 'genie'],
            'JSW GMR': ['jsw', 'gmr'],
            'KPH Dream Sports': ['kph', 'dream'],
            'Omio': ['omio'],
            'Ticombo': ['ticombo'],
            'Chelsea FC': ['chelsea'],
            'Football Platform': ['football'],
            'Walk-in/Box Office': ['walk'],
            'Dadabhai': ['dadabhai', 'inv2405']
        }
        
        for company, patterns in company_patterns.items():
            if any(pattern in filename_lower for pattern in patterns):
                return company
        
        return 'Unknown'

    def extract_price_from_filename(self, filename):
        """Extract price from filename with better parsing"""
        # Remove common invoice number patterns
        filename_clean = re.sub(r'Invoice_\d{10}', '', filename)
        filename_clean = re.sub(r'INV\d+', '', filename_clean)
        
        # Look for price patterns
        price_patterns = [
            r'_(\d{3,6}(?:\.\d{1,2})?)(?:_|\.pdf|\.png|\.jpg)',  # 3-6 digits with optional decimals
            r'_(\d{3,5})(?:_fee)?[_\.]',  # Price before fee indicator
            r'[-_](\d{3,5})$'  # Price at end of name
        ]
        
        for pattern in price_patterns:
            match = re.search(pattern, filename_clean)
            if match:
                try:
                    price = float(match.group(1))
                    # Sanity check - prices should be between 100 and 999999
                    if 100 <= price <= 999999:
                        return price
                except:
                    continue
        return 0

    def extract_date_from_filename(self, filename):
        """Extract date from filename"""
        # Pattern like 31.03_ or 31.3_ or 31.10_
        date_patterns = [
            r'(\d{1,2})\.(\d{1,2})(?:_|\.)',  # DD.MM_
            r'(\d{1,2})\.(\d{2})(?:_|\.)',     # DD.MM_
        ]
        
        for pattern in date_patterns:
            match = re.search(pattern, filename)
            if match:
                day, month = match.groups()
                # Determine year based on month
                if int(month) >= 10:  # October or later
                    year = "2023"
                else:
                    year = "2024"
                return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        return ""

    def get_month_name(self, filepath):
        """Get month name from folder path"""
        month_map = {
            "Mar_24": "March 2024",
            "Apr_24": "April 2024",
            "May_24": "May 2024",
            "Jun_24": "June 2024"
        }
        
        for key, value in month_map.items():
            if key in filepath:
                return value
        return "Unknown"

    def identify_match_from_filename(self, filename):
        """Try to identify the match from filename"""
        filename_upper = filename.upper()
        
        # IPL team codes
        teams = ["CSK", "MI", "RCB", "DC", "GT", "KKR", "LSG", "PBKS", "RR", "SRH"]
        
        # Look for team codes in filename
        found_teams = []
        for team in teams:
            if team in filename_upper:
                found_teams.append(team)
        
        if len(found_teams) >= 2:
            return f"{found_teams[0]} vs {found_teams[1]}"
        
        # Check for playoff matches
        if "QUALIFIER" in filename_upper:
            if "2" in filename:
                return "Qualifier 2"
            else:
                return "Qualifier 1"
        elif "ELIMINATOR" in filename_upper:
            return "Eliminator"
        elif "FINAL" in filename_upper and "SEMI" not in filename_upper:
            return "Final"
        
        return "Unknown Event"

    def determine_event_type(self, filename, filepath):
        """Determine if it's IPL or other event"""
        filename_lower = filename.lower()
        
        # Non-IPL events
        non_ipl_indicators = {
            "chelsea": "Chelsea FC Match",
            "football": "Football Match",
            "walk": "Event Walk-in",
            "omio": "Travel/Event via Omio",
            "ticombo": "Event via Ticombo"
        }
        
        for indicator, event_type in non_ipl_indicators.items():
            if indicator in filename_lower:
                return event_type
        
        # Check for IPL indicators
        ipl_teams = ["csk", "mi", "rcb", "dc", "gt", "kkr", "lsg", "pbks", "rr", "srh"]
        if any(team in filename_lower for team in ipl_teams):
            return "IPL 2024"
        
        # Check for playoff indicators
        if any(playoff in filename_lower for playoff in ["qualifier", "eliminator", "final"]):
            return "IPL 2024 Playoffs"
        
        # Default based on folder
        if any(month in filepath for month in ["Mar_24", "Apr_24", "May_24"]):
            return "IPL 2024"
        
        return "Unknown Event"

    def process_invoice_file(self, filepath):
        """Process a single invoice file with confidence scoring"""
        filename = os.path.basename(filepath)
        
        # Skip non-invoice files
        skip_patterns = ["schedule", ".eml", ".DS_Store", "confirmed", "booking confirmation"]
        if any(pattern in filename.lower() for pattern in skip_patterns):
            return None
        
        # Determine if it's a fee invoice
        is_fee_invoice = "fee" in filename.lower() or "_cf" in filename.lower() or "convenience" in filename.lower()
        
        # Extract data
        invoice_data = {
            "File Name": filename,
            "Month": self.get_month_name(filepath),
            "Invoice Date": self.extract_date_from_filename(filename),
            "Company": self.get_company_from_filename(filename),
            "Event Type": self.determine_event_type(filename, filepath),
            "Match/Event": self.identify_match_from_filename(filename),
            "Stand Name": "General",  # Would need OCR/PDF reading
            "Match Date": "",
            "Ticket Quantity": 1,  # Default
            "Ticket Price": self.extract_price_from_filename(filename),
            "Is Convenience Fee": is_fee_invoice,
            "File Path": filepath
        }
        
        # Try to get IPL match date
        if "IPL" in invoice_data["Event Type"]:
            match_key = invoice_data["Match/Event"]
            if match_key in IPL_2024_MATCHES:
                invoice_data["Match Date"] = IPL_2024_MATCHES[match_key]
            else:
                # Try reversed teams
                if " vs " in match_key:
                    teams = match_key.split(" vs ")
                    if len(teams) == 2:
                        reversed_match = f"{teams[1]} vs {teams[0]}"
                        if reversed_match in IPL_2024_MATCHES:
                            invoice_data["Match Date"] = IPL_2024_MATCHES[reversed_match]
        
        # Calculate confidence
        confidence, confidence_reason = self.calculate_confidence(invoice_data)
        invoice_data["Confidence %"] = confidence
        invoice_data["Confidence Notes"] = confidence_reason
        
        return invoice_data

def main():
    """Main processing function"""
    processor = InvoiceProcessor()
    base_path = "/Users/sumitjha/Dropbox/Mac/Documents/Projects/fpl-auction/Invoices"
    all_invoices = []
    
    print("Processing invoices...")
    
    # Process all files
    for root, dirs, files in os.walk(base_path):
        for file in files:
            if file.endswith(('.pdf', '.png', '.jpeg', '.jpg', '.PDF')):
                filepath = os.path.join(root, file)
                invoice_data = processor.process_invoice_file(filepath)
                if invoice_data:
                    all_invoices.append(invoice_data)
    
    # Create DataFrame
    df = pd.DataFrame(all_invoices)
    
    # Sort by confidence, month and date
    month_order = {"March 2024": 1, "April 2024": 2, "May 2024": 3, "June 2024": 4, "Unknown": 5}
    df["Month_Order"] = df["Month"].map(month_order).fillna(5)
    df = df.sort_values(["Confidence %", "Month_Order", "Invoice Date", "File Name"], ascending=[False, True, True, True])
    df = df.drop("Month_Order", axis=1)
    
    # Calculate statistics
    high_confidence = df[df["Confidence %"] >= 80]
    medium_confidence = df[(df["Confidence %"] >= 50) & (df["Confidence %"] < 80)]
    low_confidence = df[df["Confidence %"] < 50]
    
    # Create output Excel file
    output_file = "/Users/sumitjha/Dropbox/Mac/Documents/Projects/fpl-auction/Invoice_Analysis_With_Confidence.xlsx"
    
    with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
        # All invoices sheet
        df.to_excel(writer, sheet_name='All Invoices', index=False)
        
        # High confidence invoices
        high_confidence.to_excel(writer, sheet_name='High Confidence (80%+)', index=False)
        
        # Medium confidence invoices
        medium_confidence.to_excel(writer, sheet_name='Medium Confidence (50-79%)', index=False)
        
        # Low confidence invoices
        low_confidence.to_excel(writer, sheet_name='Low Confidence (<50%)', index=False)
        
        # Summary statistics
        summary_data = {
            'Metric': [
                'Total Invoices',
                'High Confidence (≥80%)',
                'Medium Confidence (50-79%)',
                'Low Confidence (<50%)',
                'Total Amount (All)',
                'Total Amount (High Confidence)',
                'IPL Invoices',
                'Other Event Invoices',
                'Convenience Fee Invoices'
            ],
            'Value': [
                len(df),
                len(high_confidence),
                len(medium_confidence),
                len(low_confidence),
                f"₹{df['Ticket Price'].sum():,.2f}",
                f"₹{high_confidence['Ticket Price'].sum():,.2f}",
                len(df[df['Event Type'].str.contains('IPL', na=False)]),
                len(df[~df['Event Type'].str.contains('IPL', na=False)]),
                len(df[df['Is Convenience Fee'] == True])
            ]
        }
        summary_df = pd.DataFrame(summary_data)
        summary_df.to_excel(writer, sheet_name='Summary', index=False)
        
        # By company analysis
        company_analysis = df.groupby('Company').agg({
            'File Name': 'count',
            'Ticket Price': 'sum',
            'Confidence %': 'mean'
        }).round(2)
        company_analysis.columns = ['Invoice Count', 'Total Amount', 'Avg Confidence %']
        company_analysis = company_analysis.sort_values('Total Amount', ascending=False)
        company_analysis.to_excel(writer, sheet_name='By Company')
        
        # By month analysis
        month_analysis = df.groupby('Month').agg({
            'File Name': 'count',
            'Ticket Price': 'sum',
            'Confidence %': 'mean'
        }).round(2)
        month_analysis.columns = ['Invoice Count', 'Total Amount', 'Avg Confidence %']
        month_analysis.to_excel(writer, sheet_name='By Month')
    
    print(f"\n✅ Excel file created: {output_file}")
    print(f"📊 Total invoices processed: {len(df)}")
    print(f"\n🎯 Confidence Distribution:")
    print(f"   High (≥80%): {len(high_confidence)} invoices")
    print(f"   Medium (50-79%): {len(medium_confidence)} invoices")
    print(f"   Low (<50%): {len(low_confidence)} invoices")
    print(f"\n💰 Financial Summary:")
    print(f"   Total Amount: ₹{df['Ticket Price'].sum():,.2f}")
    print(f"   High Confidence Amount: ₹{high_confidence['Ticket Price'].sum():,.2f}")
    
    # Show sample of low confidence items for review
    if len(low_confidence) > 0:
        print(f"\n⚠️ Low confidence items requiring review:")
        print(low_confidence[['File Name', 'Confidence %', 'Confidence Notes']].head(5).to_string())

if __name__ == "__main__":
    main()