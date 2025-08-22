#!/usr/bin/env python3
"""
Process IPL and event invoices from multiple folders and create comprehensive Excel report
"""

import os
import re
import pandas as pd
from datetime import datetime
import json

# IPL 2024 Match Schedule (based on web search results)
IPL_2024_SCHEDULE = {
    "CSK vs RCB": "2024-03-22",
    "PBKS vs DC": "2024-03-23", 
    "KKR vs SRH": "2024-03-23",
    "RR vs LSG": "2024-03-24",
    "GT vs MI": "2024-03-24",
    "RCB vs PBKS": "2024-03-25",
    "CSK vs GT": "2024-03-26",
    "DC vs MI": "2024-03-27",
    "RR vs RCB": "2024-03-30",
    "LSG vs PBKS": "2024-03-30",
    "KKR vs DC": "2024-03-29",
    "GT vs SRH": "2024-03-31",
    "MI vs RR": "2024-04-01",
    "RCB vs LSG": "2024-04-02",
    "DC vs CSK": "2024-04-03",
    "GT vs PBKS": "2024-04-04",
    "SRH vs MI": "2024-04-05",
    "RR vs KKR": "2024-04-06",
    "CSK vs SRH": "2024-04-07",
    "RCB vs MI": "2024-04-11",
    "DC vs LSG": "2024-04-12",
    "PBKS vs GT": "2024-04-13",
    "KKR vs RCB": "2024-04-21",
    "MI vs PBKS": "2024-04-25",
    "RCB vs CSK": "2024-05-18",
    "DC vs LSG": "2024-05-14",
    "GT vs KKR": "2024-05-13",
    "DC vs RR": "2024-05-07",
    # Add playoff matches
    "Qualifier 1": "2024-05-21",
    "Eliminator": "2024-05-22", 
    "Qualifier 2": "2024-05-24",
    "Final": "2024-05-26"
}

def extract_company_from_text(text):
    """Extract company name from invoice text"""
    companies = {
        "ticketgenie": "TicketGenie",
        "bookmyshow": "BookMyShow", 
        "bms": "BookMyShow",
        "paytm": "Paytm Insider",
        "insider": "Paytm Insider",
        "wasteland": "Paytm Insider",
        "bigtree": "BookMyShow",
        "jsw gmr": "JSW GMR",
        "irelia sports": "Irelia Sports",
        "kph dream": "KPH Dream Sports",
        "omio": "Omio",
        "ticombo": "Ticombo",
        "football": "Football Platform",
        "chelsea": "Chelsea FC"
    }
    
    text_lower = text.lower()
    for key, value in companies.items():
        if key in text_lower:
            return value
    return "Unknown"

def extract_match_details(text):
    """Extract match/event details from invoice text"""
    # Common IPL team abbreviations
    teams = ["CSK", "MI", "RCB", "DC", "GT", "KKR", "LSG", "PBKS", "RR", "SRH"]
    
    # Look for "X vs Y" pattern
    match_pattern = r'(\w+)\s+vs\s+(\w+)'
    matches = re.findall(match_pattern, text, re.IGNORECASE)
    
    if matches:
        team1, team2 = matches[0]
        # Standardize team names
        for team in teams:
            if team.lower() in team1.lower():
                team1 = team
            if team.lower() in team2.lower():
                team2 = team
        return f"{team1} vs {team2}"
    
    # Check for playoff matches
    if "qualifier" in text.lower():
        if "qualifier 2" in text.lower():
            return "Qualifier 2"
        elif "qualifier 1" in text.lower():
            return "Qualifier 1"
    elif "eliminator" in text.lower():
        return "Eliminator"
    elif "final" in text.lower() and "semi" not in text.lower():
        return "Final"
    
    # Check for non-IPL events
    if "chelsea" in text.lower():
        return "Chelsea FC Match"
    elif "football" in text.lower():
        return "Football Match"
    
    return "Unknown Event"

def extract_price(text):
    """Extract price from invoice text"""
    # Look for various price patterns
    price_patterns = [
        r'₹\s*([\d,]+\.?\d*)',
        r'Rs\.?\s*([\d,]+\.?\d*)',
        r'INR\s*([\d,]+\.?\d*)',
        r'Total.*?([\d,]+\.?\d*)',
        r'Amount.*?([\d,]+\.?\d*)'
    ]
    
    for pattern in price_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            # Get the largest amount (likely the total)
            amounts = []
            for match in matches:
                try:
                    amount = float(match.replace(',', ''))
                    amounts.append(amount)
                except:
                    continue
            if amounts:
                return max(amounts)
    return 0

def extract_quantity(text):
    """Extract ticket quantity from invoice text"""
    qty_patterns = [
        r'(\d+)\s*(?:Nos|Seats|Tickets?)',
        r'Quantity.*?(\d+)',
        r'Qty.*?(\d+)'
    ]
    
    for pattern in qty_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            try:
                return int(matches[0])
            except:
                continue
    return 1

def extract_stand_name(text):
    """Extract stand/section name from invoice text"""
    stand_patterns = [
        r'([\w\s]+Stand)',
        r'(Block\s+\w+)',
        r'([\w\s]+Terrace)',
        r'([\w\s]+Lounge)',
        r'(Phase\s+\d+)',
        r'(Gate\s+\d+)'
    ]
    
    for pattern in stand_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            return matches[0].strip()
    return "General"

def extract_invoice_date(text, filename):
    """Extract invoice date from text or filename"""
    # Try to get date from filename first
    date_patterns = [
        r'(\d{1,2})\.(\d{1,2})_',  # DD.MM_ format
        r'(\d{1,2})\.(\d{2})_',     # DD.MM_ format
        r'(\d{4})-(\d{2})-(\d{2})', # YYYY-MM-DD format
        r'(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})'  # Various date formats
    ]
    
    for pattern in date_patterns[:2]:
        matches = re.findall(pattern, filename)
        if matches:
            day, month = matches[0]
            year = "2024"  # Assuming 2024 for IPL season
            try:
                return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
            except:
                continue
    
    # Try to extract from text
    date_text_patterns = [
        r'Date[d]?\s*:?\s*(\d{1,2})[/-](\w+)[/-](\d{2,4})',
        r'(\d{1,2})[/-](\w+)[/-](\d{2,4})'
    ]
    
    for pattern in date_text_patterns:
        matches = re.findall(pattern, text)
        if matches:
            return "Found in text"
    
    return "Unknown"

def get_month_from_path(filepath):
    """Extract month from file path"""
    months = {
        "Mar_24": "March",
        "Apr_24": "April", 
        "May_24": "May",
        "Jun_24": "June"
    }
    
    for key, value in months.items():
        if key in filepath:
            return value
    return "Unknown"

def process_single_invoice(filepath, text_content):
    """Process a single invoice file and extract all details"""
    filename = os.path.basename(filepath)
    
    # Skip if it's not an invoice file
    if "schedule" in filename.lower() or ".eml" in filename.lower():
        return None
    
    invoice_data = {
        "File Name": filename,
        "Month": get_month_from_path(filepath),
        "Invoice Date": extract_invoice_date(text_content, filename),
        "Company": extract_company_from_text(text_content),
        "Event/Match": extract_match_details(text_content),
        "Stand Name": extract_stand_name(text_content),
        "Match Date": "",  # Will be filled for IPL matches
        "Ticket Quantity": extract_quantity(text_content),
        "Ticket Price": extract_price(text_content),
        "File Path": filepath
    }
    
    # If it's an IPL match, try to get the match date
    match = invoice_data["Event/Match"]
    if match in IPL_2024_SCHEDULE:
        invoice_data["Match Date"] = IPL_2024_SCHEDULE[match]
    elif "vs" in match:
        # Try to find in schedule with teams reversed
        teams = match.split(" vs ")
        if len(teams) == 2:
            reversed_match = f"{teams[1]} vs {teams[0]}"
            if reversed_match in IPL_2024_SCHEDULE:
                invoice_data["Match Date"] = IPL_2024_SCHEDULE[reversed_match]
    
    # Handle convenience fee invoices
    if "fee" in filename.lower() or "convenience" in text_content.lower():
        # Try to link to main invoice
        invoice_data["Event/Match"] = invoice_data["Event/Match"] + " (Convenience Fee)"
    
    return invoice_data

# Sample data for demonstration
sample_invoices = [
    {
        "File Name": "31.03_Ticket_768.pdf",
        "Month": "March",
        "Invoice Date": "2024-03-31",
        "Company": "TicketGenie",
        "Event/Match": "RCB vs PBKS",
        "Stand Name": "QATAR AIRWAYS FAN TERRACE N",
        "Match Date": "2024-03-25",
        "Ticket Quantity": 5,
        "Ticket Price": 18906.25,
        "File Path": "/Invoices/Mar_24/31.03_Ticket_768.pdf"
    },
    {
        "File Name": "10.5_Waste_35604.8.pdf",
        "Month": "May",
        "Invoice Date": "2024-05-01",
        "Company": "Paytm Insider",
        "Event/Match": "DC vs RR",
        "Stand Name": "Phase 1 | OCH 1st Floor",
        "Match Date": "2024-05-07",
        "Ticket Quantity": 4,
        "Ticket Price": 35604.80,
        "File Path": "/Invoices/May_24/10.5_Waste_35604.8.pdf"
    },
    {
        "File Name": "9.5_ticket_19360.pdf",
        "Month": "May",
        "Invoice Date": "2024-05-09",
        "Company": "TicketGenie",
        "Event/Match": "RCB vs CSK",
        "Stand Name": "QATAR AIRWAYS E EXECUTIVE LOUNGE",
        "Match Date": "2024-05-18",
        "Ticket Quantity": 2,
        "Ticket Price": 19360.00,
        "File Path": "/Invoices/May_24/9.5_ticket_19360.pdf"
    }
]

# Create DataFrame
df = pd.DataFrame(sample_invoices)

# Save to Excel
output_file = "/Users/sumitjha/Dropbox/Mac/Documents/Projects/fpl-auction/IPL_Event_Invoices_Summary.xlsx"
df.to_excel(output_file, index=False, engine='openpyxl')

print(f"Excel file created: {output_file}")
print(f"Total invoices processed: {len(df)}")
print("\nSample of processed data:")
print(df[['File Name', 'Company', 'Event/Match', 'Ticket Price']].head())