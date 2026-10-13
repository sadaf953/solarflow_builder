// supabase/functions/send-lead-to-vendor/index.ts
// Edge Function for Vendor Lead Notification Email / Brevo Dispatch

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL") || "notifications@solarflow.example";
    const senderName = Deno.env.get("BREVO_SENDER_NAME") || "SolarFlow Dispatch";

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase configuration." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const { customer_id, vendor_name, vendor_email } = body;

    if (!vendor_email) {
      return new Response(
        JSON.stringify({ error: "vendor_email is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch customer details from admin table
    let customer: any = null;
    if (customer_id) {
      const { data, error } = await supabaseAdmin
        .from("admin")
        .select("*")
        .eq("id", customer_id)
        .maybeSingle();

      if (!error && data) {
        customer = data;
      }
    }

    const custName = customer?.customer_name || "Customer";
    const custPhone = customer?.phone_number || customer?.mobile_number || "N/A";
    const custAddress = customer?.full_address || customer?.villages || "N/A";
    const custCapacity = customer?.system_capacity_kwp ? `${customer.system_capacity_kwp} kW` : "N/A";
    const custConsumerNo = customer?.consumer_no || "N/A";

    const emailSubject = `[SolarFlow] New Lead Assigned for Material Delivery: ${custName}`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #0f172a; margin-top: 0;">SolarFlow Material Dispatch Notification</h2>
        <p>Hello <strong>${vendor_name || "Vendor"}</strong>,</p>
        <p>A new solar installation lead has been allotted to you for material delivery.</p>
        
        <div style="background-color: #f8fafc; padding: 16px; border-radius: 6px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #64748b;">Customer Name:</td><td style="font-weight: bold; color: #0f172a;">${custName}</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Consumer No:</td><td style="font-weight: bold; color: #0f172a;">${custConsumerNo}</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Phone Number:</td><td style="font-weight: bold; color: #0f172a;">${custPhone}</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">System Capacity:</td><td style="font-weight: bold; color: #0f172a;">${custCapacity}</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Installation Site:</td><td style="font-weight: bold; color: #0f172a;">${custAddress}</td></tr>
          </table>
        </div>

        <p style="color: #475569; font-size: 14px;">Please coordinate material inspection and dispatch with the site team at your earliest convenience.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">SolarFlow CRM Automated Dispatch Service</p>
      </div>
    `;

    // If Brevo API key is configured, send via Brevo SMTP API
    if (brevoApiKey) {
      const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "api-key": brevoApiKey,
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: vendor_email, name: vendor_name || "Vendor" }],
          subject: emailSubject,
          htmlContent: emailHtml,
        }),
      });

      if (!brevoRes.ok) {
        const errJson = await brevoRes.json().catch(() => ({}));
        throw new Error(errJson.message || `Brevo returned status ${brevoRes.status}`);
      }

      const brevoData = await brevoRes.json().catch(() => ({}));
      return new Response(
        JSON.stringify({
          success: true,
          method: "brevo",
          messageId: brevoData.messageId || null,
          recipient: vendor_email,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If Brevo is pending setup, return successful ready response
    return new Response(
      JSON.stringify({
        success: true,
        method: "ready_mode",
        message: `Notification prepared for ${vendor_email}. Configure BREVO_API_KEY secret in Supabase to enable external delivery.`,
        recipient: vendor_email,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Failed to send vendor notification." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
