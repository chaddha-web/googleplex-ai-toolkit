import React from 'react';
import { Html, Body, Container, Text, Head, Heading } from '@react-email/components';

export const OtpEmail = ({ otp }: { otp: string }) => (
  <Html>
    <Head />
    <Body style={{ fontFamily: 'sans-serif' }}>
      <Container>
        <Heading>Your Verification Code</Heading>
        <Text>Please enter the following 6-digit code to complete your verification:</Text>
        <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>{otp}</Text>
        <Text>This code is valid for 10 minutes.</Text>
      </Container>
    </Body>
  </Html>
);
