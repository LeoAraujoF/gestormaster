-- Contabiliza todos os créditos pagos e preserva vencimentos personalizados no PIX.
CREATE OR REPLACE FUNCTION public.finalize_pix_charge(
  p_charge_id uuid,
  p_provider_payment_id text,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_charge public.pix_charges%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_base_due_date date;
  v_requested_due_date date;
  v_new_due_date date;
  v_payment_id uuid;
  v_months integer;
  v_monthly_service_cost numeric := 0;
  v_net_profit numeric := 0;
BEGIN
  SELECT *
  INTO v_charge
  FROM public.pix_charges
  WHERE id = p_charge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobrança PIX não encontrada';
  END IF;

  IF v_charge.processed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'already_processed', true,
      'charge_id', v_charge.id,
      'payment_id', v_charge.payment_id
    );
  END IF;

  IF v_charge.provider_payment_id IS NOT NULL
     AND v_charge.provider_payment_id <> p_provider_payment_id THEN
    RAISE EXCEPTION 'Pagamento não pertence à cobrança';
  END IF;

  IF round(v_charge.amount, 2) <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'Valor pago diverge da cobrança';
  END IF;

  UPDATE public.pix_charges
  SET
    provider_payment_id = p_provider_payment_id,
    status = 'paid',
    paid_at = now(),
    processed_at = now()
  WHERE id = v_charge.id;

  IF v_charge.client_id IS NOT NULL
     AND v_charge.purpose IN ('renewal', 'charge') THEN
    SELECT *
    INTO v_client
    FROM public.clients
    WHERE id = v_charge.client_id
      AND organization_id = v_charge.organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cliente da cobrança não encontrado';
    END IF;

    v_months := greatest(v_charge.months_to_renew, 1);
    v_base_due_date := greatest(v_client.due_date, current_date);

    IF coalesce(v_charge.metadata ->> 'target_due_date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      BEGIN
        v_requested_due_date := (v_charge.metadata ->> 'target_due_date')::date;
      EXCEPTION WHEN others THEN
        v_requested_due_date := NULL;
      END;
    END IF;

    IF v_requested_due_date IS NOT NULL
       AND v_requested_due_date > v_base_due_date THEN
      v_new_due_date := v_requested_due_date;
    ELSE
      v_new_due_date := (
        v_base_due_date + make_interval(months => v_months)
      )::date;
    END IF;

    SELECT coalesce(sum(service.cost), 0)
    INTO v_monthly_service_cost
    FROM public.client_services assignment
    JOIN public.services service ON service.id = assignment.service_id
    WHERE assignment.client_id = v_client.id;

    v_net_profit := v_charge.amount - (
      v_monthly_service_cost *
      greatest(coalesce(v_client.screens, 1), 1) *
      v_months
    );

    UPDATE public.clients
    SET
      due_date = v_new_due_date,
      status = 'active',
      updated_at = now()
    WHERE id = v_client.id;

    INSERT INTO public.payments (
      organization_id,
      user_id,
      client_id,
      amount_paid,
      net_profit,
      months_renewed,
      payment_method,
      provider,
      paid_at
    )
    VALUES (
      v_charge.organization_id,
      coalesce(v_client.user_id, v_charge.user_id),
      v_client.id,
      v_charge.amount,
      v_net_profit,
      v_months,
      'pix',
      v_charge.provider,
      now()
    )
    RETURNING id INTO v_payment_id;

    UPDATE public.pix_charges
    SET payment_id = v_payment_id
    WHERE id = v_charge.id;
  END IF;

  INSERT INTO public.audit_logs (
    organization_id,
    user_id,
    action,
    resource,
    resource_id,
    details
  )
  VALUES (
    v_charge.organization_id,
    v_charge.user_id,
    'pix.payment.finalized',
    'pix_charges',
    v_charge.id::text,
    jsonb_build_object(
      'provider_payment_id', p_provider_payment_id,
      'amount', p_amount,
      'payment_id', v_payment_id,
      'months_renewed', v_months,
      'new_due_date', v_new_due_date,
      'net_profit', v_net_profit
    )
  );

  RETURN jsonb_build_object(
    'already_processed', false,
    'charge_id', v_charge.id,
    'payment_id', v_payment_id,
    'new_due_date', v_new_due_date
  );
END;
$function$;
