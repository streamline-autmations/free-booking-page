import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const payload = await req.json();
  
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
  
  // Insert booking into database
  const { data, error } = await supabase
    .from("bookings")
    .insert({
      business_id: payload.businessId,
      business_name: payload.businessName,
      customer_name: payload.customer.name,
      customer_email: payload.customer.email,
      customer_phone: payload.customer.phone,
      customer_note: payload.customer.note || "",
      service_id: payload.booking.serviceId,
      service_name: payload.booking.service,
      service_duration: payload.booking.duration,
      service_price: payload.booking.price,
      booking_date: payload.booking.date,
      booking_time: payload.booking.time,
      booking_date_formatted: payload.booking.dateFormatted,
      booking_time_formatted: payload.booking.timeFormatted,
      submitted_at: payload.submittedAt,
    });
  
  if (error) {
    console.error("Error inserting booking:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { "Content-Type": "application/json" },
  });
});