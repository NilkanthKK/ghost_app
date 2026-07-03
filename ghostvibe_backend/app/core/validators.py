import re
import phonenumbers
from phonenumbers import NumberParseException
from fastapi import HTTPException, status

# Potential SQL Injection and XSS signatures
SQLI_PATTERN = re.compile(r"('|--|union\s+select|select\s+.*from|or\s+\d+=\d+)", re.IGNORECASE)
XSS_PATTERN = re.compile(r"(<script|<iframe|javascript:|onmouseover|onerror|onload)", re.IGNORECASE)

def sanitize_text(value: str) -> str:
    if not value:
        return ""
    stripped = value.strip()
    if SQLI_PATTERN.search(stripped):
        raise ValueError("Potential SQL injection payload detected")
    if XSS_PATTERN.search(stripped):
        raise ValueError("Potential XSS payload detected")
    return stripped

def validate_phone_number(value: str) -> str:
    sanitized = sanitize_text(value)
    cleaned = "".join(c for c in sanitized if c.isdigit() or c == "+")
    
    # Try Stage 1: Parse as E.164 (prepending + if missing)
    phone_to_parse = cleaned if cleaned.startswith('+') else f"+{cleaned}"
    try:
        parsed_number = phonenumbers.parse(phone_to_parse, None)
        if phonenumbers.is_valid_number(parsed_number):
            return phonenumbers.format_number(parsed_number, phonenumbers.PhoneNumberFormat.E164)
    except Exception:
        pass
        
    # Try Stage 2: Parse as local Indian format (default regional fallback)
    try:
        parsed_number = phonenumbers.parse(cleaned, "IN")
        if phonenumbers.is_valid_number(parsed_number):
            return phonenumbers.format_number(parsed_number, phonenumbers.PhoneNumberFormat.E164)
    except Exception:
        pass
        
    raise ValueError("Invalid phone number format or country code.")

def validate_email(value: str) -> str:
    sanitized = sanitize_text(value)
    # RFC-compliant email regex
    if not re.match(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$", sanitized):
        raise ValueError("Invalid email format.")
    return sanitized.lower()

def validate_otp_code(value: str) -> str:
    sanitized = sanitize_text(value)
    if not re.match(r"^\d{6}$", sanitized):
        raise ValueError("OTP code must be exactly 6 digits.")
    return sanitized

def validate_pin(value: str) -> str:
    sanitized = sanitize_text(value)
    if not re.match(r"^\d{4,6}$", sanitized):
        raise ValueError("PIN must be between 4 and 6 digits.")
    
    # Block weak PIN sequences
    weak_pins = {"0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
                 "1234", "4321", "12345", "54321", "123456", "654321", "9876"}
    if sanitized in weak_pins:
        raise ValueError("PIN is too weak or sequential.")
        
    # Check for repeated patterns (e.g. 111111)
    if len(set(sanitized)) == 1:
        raise ValueError("PIN cannot contain all identical digits.")
        
    # Check for identical subset digits (e.g., 111222)
    for digit in set(sanitized):
        if sanitized.count(digit) >= 3:
            raise ValueError("PIN cannot contain more than 2 identical digits.")

    # Birth year check (1900-2100)
    if len(sanitized) == 4:
        year = int(sanitized)
        if 1900 <= year <= 2100:
            raise ValueError("PIN cannot be a birth year.")

    # Check for simple sequential digits (e.g., 123456)
    is_sequential_up = True
    is_sequential_down = True
    for i in range(1, len(sanitized)):
        diff = int(sanitized[i]) - int(sanitized[i-1])
        if diff != 1:
            is_sequential_up = False
        if diff != -1:
            is_sequential_down = False
            
    if is_sequential_up or is_sequential_down:
        raise ValueError("PIN cannot contain sequential digits.")
        
    return sanitized

def validate_username(value: str) -> str:
    sanitized = sanitize_text(value)
    if len(sanitized) < 3 or len(sanitized) > 30:
        raise ValueError("Username must be between 3 and 30 characters.")
        
    # No multiple consecutive spaces
    if "  " in value:
        raise ValueError("Username cannot contain consecutive spaces.")
        
    # Allow letters, numbers, underscores and dots
    if not re.match(r"^[a-zA-Z0-9_.]+$", sanitized):
        raise ValueError("Username can only contain letters, numbers, underscores (_), and dots (.).")
        
    # Reserved names
    reserved = {"admin", "root", "support", "ghostvibe", "system", "moderator", "operator"}
    if sanitized.lower() in reserved:
        raise ValueError("This username is reserved and cannot be registered.")
        
    return sanitized

def validate_bio(value: str) -> str:
    if not value:
        return ""
    sanitized = sanitize_text(value)
    if len(sanitized) > 150:
        raise ValueError("Bio must not exceed 150 characters.")
    return sanitized
