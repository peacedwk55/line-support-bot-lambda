output "webhook_url" {
  description = "Webhook URL สำหรับตั้งค่าใน LINE Developers"
  value       = "${aws_apigatewayv2_stage.default.invoke_url}/webhook"
}

output "dynamodb_table" {
  value = aws_dynamodb_table.chat_history.name
}

output "lambda_function" {
  value = aws_lambda_function.bot.function_name
}
