import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "../services/api";
import type { PaymentOrder, PaymentOrderStatus, PaymentProduct } from "../types";

type PaymentMachineState = "IDLE" | "CREATING" | "WAITING" | "CHECKING" | "PAID" | "FAILED" | "EXPIRED";

export function usePaymentCheckout(product: PaymentProduct | null) {
  const queryClient = useQueryClient();
  const createOrder = useMutation({
    mutationFn: (productCode: string) =>
      api<PaymentOrder>(`/payments/orders/product/${productCode}`, { method: "POST" }),
  });

  const createOrderMutate = createOrder.mutate;
  useEffect(() => {
    if (product?.code && !createOrder.data && !createOrder.isPending && !createOrder.isError) {
      createOrderMutate(product.code);
    }
  }, [product?.code, createOrder.data, createOrder.isPending, createOrder.isError, createOrderMutate]);

  const orderId = createOrder.data?.id;

  // Dừng hỏi lại khi đơn đã có kết quả cuối, tránh tiếp tục gửi request sau thanh toán.
  const orderStatusQuery = useQuery({
    queryKey: ["payment-order-status", orderId],
    queryFn: () => api<PaymentOrderStatus>(`/payments/orders/${orderId}`),
    enabled: !!orderId,
    refetchInterval: (query) => {
      const currentStatus = query.state.data?.status;
      if (currentStatus === "SUCCESS" || currentStatus === "EXPIRED" || currentStatus === "FAILED") {
        return false;
      }
      return 5000;
    },
  });

  const backendStatus = orderStatusQuery.data?.status ?? createOrder.data?.status;

  let machineState: PaymentMachineState = "IDLE";
  if (createOrder.isPending) {
    machineState = "CREATING";
  } else if (createOrder.isError) {
    machineState = "FAILED";
  } else if (backendStatus === "SUCCESS") {
    machineState = "PAID";
  } else if (backendStatus === "EXPIRED") {
    machineState = "EXPIRED";
  } else if (backendStatus === "FAILED") {
    machineState = "FAILED";
  } else if (orderStatusQuery.isFetching) {
    machineState = "CHECKING";
  } else if (createOrder.data) {
    machineState = "WAITING";
  }

  // Chỉ tải lại số dư sau khi backend xác nhận đơn thành công.
  useEffect(() => {
    if (machineState === "PAID") {
      queryClient.invalidateQueries({ queryKey: ["credit-balance"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["chatbots"] });
    }
  }, [machineState, queryClient]);

  return { createOrder, orderStatusQuery, machineState };
}
